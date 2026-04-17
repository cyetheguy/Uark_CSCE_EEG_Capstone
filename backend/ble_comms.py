import re
import subprocess
import threading
import time
import json
from collections import deque
from pathlib import Path
from typing import Tuple, List, Optional, Dict, Any, Generator, Sequence

from debug import getDebug
from runtime_paths import get_backend_root

BLUETOOTH_HEX_MAX_LINES: int = 500
BLUETOOTH_SAMPLES_MAX: int = 100_000

# Shared state for BLE data.
# Design note: we keep two parallel views:
# - `bluetooth_hex_lines`: last N raw "Value (02x hex): ..." lines for debugging/diagnostics
# - `bluetooth_samples`: numeric sample values parsed from those lines for plotting + saving
bluetooth_hex_lines: deque[Dict[str, str]] = deque(maxlen=BLUETOOTH_HEX_MAX_LINES)
bluetooth_samples: List[float] = []
bluetooth_samples_lock: threading.Lock = threading.Lock()

_HEX_LINE_PREFIX: str = "Value (02x hex): "
_HEX_ONLY_LINE_RE: re.Pattern[str] = re.compile(r"^\s*([0-9a-fA-F]+)\s*$")
# Must match firmware_test/main.c BRAINWAVE_FRAME_MAGIC — only 0xEE + int8 is plotted as EEG.
BRAINWAVE_FRAME_MAGIC: int = 0xEE
BACKEND_DIR: Path = get_backend_root()
DESKTOP_EXE: Path = BACKEND_DIR / "CommunicationManager" / "bin" / "Desktop" / "main.exe"

# Desktop client lifecycle:
# - Backend launches `main.exe` and keeps its stdin/stdout piped.
# - Flask endpoints send commands (scan/connect) by writing to stdin.
# - A background thread continuously drains stdout and extracts samples.
_desktop_proc: Optional[subprocess.Popen] = None
_desktop_lock: threading.Lock = threading.Lock()
_awaiting_split_hex_payload: bool = False


def _desktop_log(msg: str, *, end: str = "\n", flush: bool = True) -> None:
    """Mirror Desktop client activity in the backend console only when started with --debug."""
    if getDebug():
        print(msg, end=end, flush=flush)


def _extract_brainwave_samples(raw_bytes: bytes) -> List[float]:
    """
    Decode bytes from the BM71 transparent notify payload.

    Wire format (firmware_test/main.c): [0xEE][raw_lo][raw_hi] — int16 LE microvolts, 250 SPS.
    Legacy: a single-byte notify is treated as one signed int8 (older firmware without magic).

    Any bytes that are not part of an 0xEE+int16LE triple (and not the lone-byte legacy case) are
    ignored so control traffic / framing noise does not reach the visualizer.
    """
    out: List[float] = []
    i = 0
    n: int = len(raw_bytes)
    while i + 2 < n:
        if raw_bytes[i] == BRAINWAVE_FRAME_MAGIC:
            out.append(float(int.from_bytes(raw_bytes[i + 1 : i + 3], byteorder="little", signed=True)))
            i += 3
        else:
            i += 1
    if not out and n == 1:
        out.append(float(int.from_bytes(raw_bytes, byteorder="big", signed=True)))
    return out


def _parse_hex_value_line(line: str) -> Tuple[Optional[str], List[float]]:
    """
    Parse the Desktop consumer thread line only:
      "Value (02x hex): <hex pairs...>"
    """
    line = line.strip()
    if not line.startswith(_HEX_LINE_PREFIX):
        return None, []
    raw_hex: str = line[len(_HEX_LINE_PREFIX):].strip()
    if not raw_hex:
        return None, []

    hex_chars: str = re.sub(r"[^0-9a-fA-F]", "", raw_hex)
    if not hex_chars:
        return None, []
    if len(hex_chars) % 2:
        hex_chars = "0" + hex_chars
    try:
        raw_bytes: bytes = bytes.fromhex(hex_chars)
    except ValueError:
        return raw_hex, []
    if not raw_bytes:
        return raw_hex, []
    return raw_hex, _extract_brainwave_samples(raw_bytes)

def _drain_desktop_stdout(proc: subprocess.Popen) -> None:
    """
    Continuously read stdout from `main.exe`.
    
    Why this exists:
    - `Popen(..., stdout=PIPE)` requires the parent process to drain stdout,
      otherwise the child can block once its pipe buffer fills.
    - We piggyback on those logs to extract and accumulate EEG samples.
    
    Threading:
    - This function is run in a daemon thread created by `launch_desktop_client`.
    - It appends to the shared buffers. `bluetooth_samples` uses a lock to keep
      concurrent reads (from Flask routes) consistent.
    """
    global bluetooth_hex_lines, bluetooth_samples, _awaiting_split_hex_payload
    try:
        if proc.stdout is None:
            return
        for line in proc.stdout:
            _desktop_log(f"[Desktop] {line}", end="", flush=True)
            stripped: str = line.strip()
            # Only accept the dedicated consumeSampleQueue() line. Do not match
            # "Value (02x hex):" embedded inside BM71 debug lines (stdout interleaving).
            if stripped.startswith(_HEX_LINE_PREFIX):
                rest: str = stripped[len(_HEX_LINE_PREFIX):].strip()
                if not rest:
                    _awaiting_split_hex_payload = True
                else:
                    _awaiting_split_hex_payload = False
                    raw_hex_diag, values = _parse_hex_value_line(stripped)
                    bluetooth_hex_lines.append({"raw": stripped, "hex": raw_hex_diag or ""})
                    if values:
                        with bluetooth_samples_lock:
                            for value in values:
                                bluetooth_samples.append(value)
                                if len(bluetooth_samples) > BLUETOOTH_SAMPLES_MAX:
                                    bluetooth_samples.pop(0)
            elif _awaiting_split_hex_payload:
                m_only = _HEX_ONLY_LINE_RE.match(stripped)
                if m_only:
                    combined: str = f"{_HEX_LINE_PREFIX}{m_only.group(1).strip()}"
                    raw_hex_diag, values = _parse_hex_value_line(combined)
                    bluetooth_hex_lines.append({"raw": stripped, "hex": raw_hex_diag or ""})
                    if values:
                        with bluetooth_samples_lock:
                            for value in values:
                                bluetooth_samples.append(value)
                                if len(bluetooth_samples) > BLUETOOTH_SAMPLES_MAX:
                                    bluetooth_samples.pop(0)
                _awaiting_split_hex_payload = False
    except Exception:
        pass

def launch_desktop_client() -> bool:
    """Start main.exe with stdin piped so we can send commands from Flask."""
    global _desktop_proc
    with _desktop_lock:
        if _desktop_proc is not None and _desktop_proc.poll() is None:
            _desktop_log("Desktop client already running.")
            return True

        if not DESKTOP_EXE.exists():
            _desktop_log(f"[Desktop] WARNING: {DESKTOP_EXE} not found — build it with buildDesk.bat")
            return False

        try:
            _desktop_proc = subprocess.Popen(
                [str(DESKTOP_EXE)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=str(DESKTOP_EXE.parent),
                text=True,
                bufsize=1,
            )
            t: threading.Thread = threading.Thread(target=_drain_desktop_stdout, args=(_desktop_proc,), daemon=True)
            t.start()
            _desktop_log(f"[Desktop] main.exe started (PID {_desktop_proc.pid})")
            return True
        except Exception as e:
            _desktop_log(f"[Desktop] Failed to start main.exe: {e}")
            return False

def send_desktop_command(cmd: str) -> bool:
    """Send a single-word command to main.exe's stdin (e.g. 'scan')."""
    global _desktop_proc
    with _desktop_lock:
        if _desktop_proc is None or _desktop_proc.poll() is not None or _desktop_proc.stdin is None:
            _desktop_log("[Desktop] Process not running — cannot send command.")
            return False
        try:
            # Desktop.cpp expects exactly one token per line (no JSON protocol here).
            _desktop_proc.stdin.write(cmd.strip() + "\n")
            _desktop_proc.stdin.flush()
            _desktop_log(f"[Desktop] Sent command: {cmd.strip()}")
            return True
        except Exception as e:
            _desktop_log(f"[Desktop] Error sending command '{cmd}': {e}")
            return False


def send_desktop_commands(commands: Sequence[str]) -> bool:
    """Send multiple commands to main.exe stdin in order."""
    global _desktop_proc
    with _desktop_lock:
        if _desktop_proc is None or _desktop_proc.poll() is not None or _desktop_proc.stdin is None:
            _desktop_log("[Desktop] Process not running — cannot send commands.")
            return False
        try:
            for cmd in commands:
                _desktop_proc.stdin.write(cmd.strip() + "\n")
            _desktop_proc.stdin.flush()
            _desktop_log(f"[Desktop] Sent commands: {', '.join(c.strip() for c in commands)}")
            return True
        except Exception as e:
            _desktop_log(f"[Desktop] Error sending command list: {e}")
            return False

def stream_live_data() -> Generator[str, None, None]:
    """
    Generator yielding live samples as Server-Sent Events (SSE).
    
    SSE format reminder:
      yield "data: <json-string>\\n\\n"
    
    This function implements a simple "tail -f" of `bluetooth_samples`:
    - `last_len` tracks how many samples this SSE client has already seen.
    - We initialize `last_len` to the current buffer length so a newly opened
      stream starts from "now" (new incoming samples only), rather than replaying
      historical buffered samples from prior acquisitions/logins.
    - We then send only newly appended samples on each loop.
    """
    sample_count: int = 0
    start_time: float = time.time()
    with bluetooth_samples_lock:
        last_len: int = len(bluetooth_samples)
    while True:
        new_samples: List[float] = []
        with bluetooth_samples_lock:
            n: int = len(bluetooth_samples)
            if n > last_len:
                new_samples = bluetooth_samples[last_len:n]
                last_len = n
                
        for value in new_samples:
            elapsed: float = time.time() - start_time
            yield f"data: {json.dumps({'value': value, 'timestamp': elapsed, 'sample': sample_count})}\n\n"
            sample_count += 1
            
        time.sleep(0.01)
        if time.time() - start_time > 3600: 
            break

def get_new_samples(last_len: int) -> Tuple[List[float], int]:
    """
    Callback used by the plotting stream to retrieve appended samples.
    
    We return:
    - new_part: samples from [last_len:n)
    - n: updated last_len value for the caller to keep
    """
    with bluetooth_samples_lock:
        n: int = len(bluetooth_samples)
        new_part: List[float] = bluetooth_samples[last_len:n] if n > last_len else []
        return new_part, n