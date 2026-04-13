import re
import subprocess
import threading
import time
import json
from collections import deque
from pathlib import Path
from typing import Tuple, List, Optional, Dict, Any, Generator

from debug import getDebug

BLUETOOTH_HEX_MAX_LINES: int = 500
BLUETOOTH_SAMPLES_MAX: int = 100_000

# Shared state for BLE data
bluetooth_hex_lines: deque[Dict[str, str]] = deque(maxlen=BLUETOOTH_HEX_MAX_LINES)
bluetooth_samples: List[float] = []
bluetooth_samples_lock: threading.Lock = threading.Lock()

_HEX_LINE_PREFIX: str = "Value (02x hex): "
BACKEND_DIR: Path = Path(__file__).parent
DESKTOP_EXE: Path = BACKEND_DIR / "CommunicationManager" / "bin" / "Desktop" / "main.exe"

_desktop_proc: Optional[subprocess.Popen] = None
_desktop_lock: threading.Lock = threading.Lock()


def _desktop_log(msg: str, *, end: str = "\n", flush: bool = True) -> None:
    """Mirror Desktop client activity in the backend console only when started with --debug."""
    if getDebug():
        print(msg, end=end, flush=flush)


def _parse_hex_value_line(line: str) -> Tuple[Optional[str], Optional[float]]:
    """If line is 'Value (02x hex): XXYY...', return (raw_hex_str, parsed_float_or_none)."""
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
    """Read stdout from main.exe; print it and capture hex lines / parsed samples."""
    global bluetooth_hex_lines, bluetooth_samples
    try:
        if proc.stdout is None:
            return
        for line in proc.stdout:
            _desktop_log(f"[Desktop] {line}", end="", flush=True)
            raw_hex, value = _parse_hex_value_line(line)
            if raw_hex is not None:
                bluetooth_hex_lines.append({"raw": line.strip(), "hex": raw_hex})
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
            _desktop_proc.stdin.write(cmd.strip() + "\n")
            _desktop_proc.stdin.flush()
            _desktop_log(f"[Desktop] Sent command: {cmd.strip()}")
            return True
        except Exception as e:
            _desktop_log(f"[Desktop] Error sending command '{cmd}': {e}")
            return False

def stream_live_data() -> Generator[str, None, None]:
    """Generator yielding live BLE samples for Server-Sent Events (SSE)."""
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
    """Helper callback to fetch new BLE samples without exposing the thread lock."""
    with bluetooth_samples_lock:
        n: int = len(bluetooth_samples)
        new_part: List[float] = bluetooth_samples[last_len:n] if n > last_len else []
        return new_part, n