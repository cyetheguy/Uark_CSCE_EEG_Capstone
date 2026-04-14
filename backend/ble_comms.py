import re
import subprocess
import threading
import time
import json
from collections import deque
from pathlib import Path
from typing import Tuple, List, Optional, Dict, Any, Generator, Sequence

from debug import getDebug

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
_HEX_ANYWHERE_RE: re.Pattern[str] = re.compile(r"Value \(02x hex\):\s*([0-9a-fA-F\s]*)")
_HEX_ONLY_LINE_RE: re.Pattern[str] = re.compile(r"^\s*([0-9a-fA-F]+)\s*$")
BACKEND_DIR: Path = Path(__file__).parent
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


def _parse_hex_value_line(line: str) -> Tuple[Optional[str], Optional[float]]:
    """
    Parse the Desktop client's log line format.
    
    Expected prefix:
      "Value (02x hex): <hex bytes...>"
    
    Returns:
    - raw_hex_str: the extracted hex substring (for diagnostics)
    - parsed_float_or_none: best-effort conversion into a numeric EEG sample
    
    Parsing strategy:
    - Try interpreting the bytes as UTF-8 text containing a number (some firmwares send ASCII).
    - Otherwise, treat pairs of bytes as little-endian int16 samples and take the first.
      (This matches many BLE payload designs where each notification is one int16.)
    """
    line = line.strip()
    if not line.startswith(_HEX_LINE_PREFIX):
        return None, None
    raw_hex: str = line[len(_HEX_LINE_PREFIX):].strip()
    if not raw_hex:
        return raw_hex or None, None
    
    hex_chars: str = re.sub(r"[^0-9a-fA-F]", "", raw_hex)
    if len(hex_chars) % 2:
        hex_chars = "0" + hex_chars
    try:
        raw_bytes: bytes = bytes.fromhex(hex_chars)
    except ValueError:
        return raw_hex, None
        
    try:
        s: str = raw_bytes.decode("utf-8")
        return raw_hex, float(s.strip())
    except (ValueError, UnicodeDecodeError):
        pass

    # Firmware binary frame support:
    # observed payload shape: 01 01 <ch1_lo> <ch1_hi> <ch2_lo> <ch2_hi>
    # where first two bytes are a frame marker/version.
    # ch1 has looked like a ramp/counter in live tests, so use ch2 for EEG.
    if len(raw_bytes) >= 4 and raw_bytes[0] == 0x01 and raw_bytes[1] == 0x01:
        import struct
        if len(raw_bytes) >= 6:
            primary_value: int = struct.unpack_from("<h", raw_bytes, 4)[0]
        else:
            primary_value = struct.unpack_from("<h", raw_bytes, 2)[0]
        return raw_hex, float(primary_value)
        
    if len(raw_bytes) >= 2:
        import struct
        vals: List[int] = []
        for i in range(0, len(raw_bytes), 2):
            if i + 2 <= len(raw_bytes):
                vals.append(struct.unpack_from("<h", raw_bytes, i)[0])
        if vals:
            return raw_hex, float(vals[0])
    return raw_hex, None

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
            # Desktop logs can interleave lines (BM71 debug + Value lines), so parse
            # Value payloads even when split across lines.
            line_candidates: List[Tuple[str, str]] = []
            for m in _HEX_ANYWHERE_RE.finditer(line):
                payload: str = m.group(1).strip()
                if payload:
                    line_candidates.append((line.strip(), payload))
                else:
                    _awaiting_split_hex_payload = True

            if _awaiting_split_hex_payload and not line_candidates:
                m_only = _HEX_ONLY_LINE_RE.match(line.strip())
                if m_only:
                    line_candidates.append((line.strip(), m_only.group(1)))
                    _awaiting_split_hex_payload = False
                elif line.strip():
                    _awaiting_split_hex_payload = False

            for raw_line, raw_hex in line_candidates:
                bluetooth_hex_lines.append({"raw": raw_line, "hex": raw_hex})
                _, value = _parse_hex_value_line(f"{_HEX_LINE_PREFIX}{raw_hex}")
                if value is not None:
                    with bluetooth_samples_lock:
                        bluetooth_samples.append(value)
                        if len(bluetooth_samples) > BLUETOOTH_SAMPLES_MAX:
                            bluetooth_samples.pop(0)
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
    - `last_len` tracks how many samples the client has already seen.
    - We send only the new appended samples on each loop.
    """
    sample_count: int = 0
    start_time: float = time.time()
    last_len: int = 0
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