from __future__ import annotations
import sys
import array
import io
import base64
import subprocess
import threading
import os
import re
from collections import deque
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Use non-GUI backend for server
import matplotlib.pyplot as plt

# Import your existing custom modules
import debug
from debug import printDebug
import crypto_ops
from crypto_ops import authenticate, create_usr_file
# Parser migration: Modbus RDF parsing moved from frontend to backend
from modbus_parser import parse_modbus_data
import glob

# ── Bluetooth (Desktop subprocess) hex capture ───────────────────────────────
# When Desktop receives BLE characteristic values it prints "Value (02x hex): XX..."
# We capture those lines and parse to numeric samples for debug-mode EDF streaming.
BLUETOOTH_HEX_MAX_LINES = 500
BLUETOOTH_SAMPLES_MAX = 100_000
_bluetooth_hex_lines: deque = deque(maxlen=BLUETOOTH_HEX_MAX_LINES)
_bluetooth_samples: list = []
_bluetooth_samples_lock = threading.Lock()
_HEX_LINE_PREFIX = "Value (02x hex): "

def _parse_hex_value_line(line: str) -> tuple[str | None, float | None]:
    """If line is 'Value (02x hex): XXYY...', return (raw_hex_str, parsed_float_or_none)."""
    line = line.strip()
    if not line.startswith(_HEX_LINE_PREFIX):
        return None, None
    raw_hex = line[len(_HEX_LINE_PREFIX):].strip()
    if not raw_hex:
        return raw_hex or None, None
    # Normalize: remove spaces, take only hex chars
    hex_chars = re.sub(r"[^0-9a-fA-F]", "", raw_hex)
    if len(hex_chars) % 2:
        hex_chars = "0" + hex_chars
    try:
        raw_bytes = bytes.fromhex(hex_chars)
    except ValueError:
        return raw_hex, None
    # Device sends ASCII string (e.g. "123.456789") over BLE; Desktop prints hex of those bytes
    try:
        s = raw_bytes.decode("utf-8")
        return raw_hex, float(s.strip())
    except (ValueError, UnicodeDecodeError):
        pass
    # Fallback: treat as 16-bit LE pairs (e.g. binary EEG)
    if len(raw_bytes) >= 2:
        import struct
        vals = []
        for i in range(0, len(raw_bytes), 2):
            if i + 2 <= len(raw_bytes):
                vals.append(struct.unpack_from("<h", raw_bytes, i)[0])
        if vals:
            return raw_hex, float(vals[0])
    return raw_hex, None

app = Flask(__name__)
CORS(app)  # Enables the React frontend to talk to this Python backend

# Get the directory where this script is located
BACKEND_DIR = Path(__file__).parent
SESSIONS_DIR = BACKEND_DIR / "sessions"
USER_DIR = BACKEND_DIR / "user"

# ── Desktop client (CommunicationManager) subprocess ────────────────────────
DESKTOP_EXE = BACKEND_DIR / "CommunicationManager" / "bin" / "Desktop" / "main.exe"
_desktop_proc: subprocess.Popen | None = None
_desktop_lock = threading.Lock()

def _drain_desktop_stdout(proc: subprocess.Popen):
    """Read stdout from main.exe; print it and capture hex lines / parsed samples."""
    global _bluetooth_hex_lines, _bluetooth_samples
    try:
        for line in proc.stdout:
            print(f"[Desktop] {line}", end="", flush=True)
            raw_hex, value = _parse_hex_value_line(line)
            if raw_hex is not None:
                _bluetooth_hex_lines.append({"raw": line.strip(), "hex": raw_hex})
            if value is not None:
                with _bluetooth_samples_lock:
                    _bluetooth_samples.append(value)
                    if len(_bluetooth_samples) > BLUETOOTH_SAMPLES_MAX:
                        _bluetooth_samples.pop(0)
    except Exception:
        pass

def launch_desktop_client():
    """Start main.exe with stdin piped so we can send commands from Flask."""
    global _desktop_proc
    with _desktop_lock:
        if _desktop_proc is not None and _desktop_proc.poll() is None:
            printDebug("Desktop client already running.")
            return True

        if not DESKTOP_EXE.exists():
            print(f"[Desktop] WARNING: {DESKTOP_EXE} not found — build it with buildDesk.bat")
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
            # Drain stdout in background so the pipe never fills up
            t = threading.Thread(target=_drain_desktop_stdout, args=(_desktop_proc,), daemon=True)
            t.start()
            print(f"[Desktop] main.exe started (PID {_desktop_proc.pid})")
            return True
        except Exception as e:
            print(f"[Desktop] Failed to start main.exe: {e}")
            return False

def send_desktop_command(cmd: str) -> bool:
    """Send a single-word command to main.exe's stdin (e.g. 'scan')."""
    global _desktop_proc
    with _desktop_lock:
        if _desktop_proc is None or _desktop_proc.poll() is not None:
            print("[Desktop] Process not running — cannot send command.")
            return False
        try:
            _desktop_proc.stdin.write(cmd.strip() + "\n")
            _desktop_proc.stdin.flush()
            print(f"[Desktop] Sent command: {cmd.strip()}")
            return True
        except Exception as e:
            print(f"[Desktop] Error sending command '{cmd}': {e}")
            return False
# ─────────────────────────────────────────────────────────────────────────────

def get_edf_file_for_user(username: str) -> Path:
    """Return which EDF file to use for this user (demo vs admin)."""
    u = (username or "").strip().lower()
    if u == "demo":
        p = SESSIONS_DIR / "SC4001E0-PSG.edf"
    elif u == "admin":
        p = SESSIONS_DIR / "SC4002E0-PSG.edf"
    else:
        edf_files = list(SESSIONS_DIR.glob("*.edf"))
        p = edf_files[0] if edf_files else None
    if p and p.exists():
        return p
    edf_files = list(SESSIONS_DIR.glob("*.edf"))
    if edf_files:
        return edf_files[0]
    raise FileNotFoundError("No EDF files in sessions directory")


def get_edf_start_and_duration(edf_path: Path) -> tuple[str, str, float]:
    """Return (start_date_str, start_time_str, duration_seconds) from EDF fixed header.
    EDF format: startdate at bytes 168:176 (dd.mm.yy), starttime at 176:184 (hh.mm.ss)."""
    with open(edf_path, 'rb') as fh:
        fixed = fh.read(256)
    startdate = (fixed[168:176].decode("ascii", "ignore") or "01.01.00").strip()
    starttime = (fixed[176:184].decode("ascii", "ignore") or "00.00.00").strip()
    num_records = int(fixed[236:244].decode("ascii", "ignore").strip() or "-1")
    record_duration = float(fixed[244:252].decode("ascii", "ignore").strip() or "1")
    duration_sec = (num_records * record_duration) if num_records > 0 else 0
    return startdate, starttime, duration_sec


def read_edf_header(fh):
    """Read EDF header"""
    fixed = fh.read(256)
    num_records = int(fixed[236:244].decode("ascii", "ignore").strip() or "-1")
    record_duration = float(fixed[244:252].decode("ascii", "ignore").strip() or "1")
    num_signals = int(fixed[252:256].decode("ascii", "ignore").strip())
    
    def read_str_list(field_len, count):
        data = fh.read(field_len * count)
        return [data[i * field_len:(i + 1) * field_len].decode("ascii", "ignore").strip() 
               for i in range(count)]
    
    labels = read_str_list(16, num_signals)
    _ = read_str_list(80, num_signals)
    _ = read_str_list(8, num_signals)
    phys_min = [float(x or "0") for x in read_str_list(8, num_signals)]
    phys_max = [float(x or "1") for x in read_str_list(8, num_signals)]
    dig_min = [int(x or "-32768") for x in read_str_list(8, num_signals)]
    dig_max = [int(x or "32767") for x in read_str_list(8, num_signals)]
    _ = read_str_list(80, num_signals)
    samples_per_record = [int(x or "0") for x in read_str_list(8, num_signals)]
    _ = read_str_list(32, num_signals)
    
    return {
        'num_records': num_records,
        'record_duration': record_duration,
        'num_signals': num_signals,
        'labels': labels,
        'samples_per_record': samples_per_record,
        'phys_min': phys_min,
        'phys_max': phys_max,
        'dig_min': dig_min,
        'dig_max': dig_max
    }

def read_edf_samples(edf_path, channel_idx=0, max_samples=3000):
    """Read EDF samples from specified channel"""
    with open(edf_path, 'rb') as fh:
        header = read_edf_header(fh)
        
        sig_samples_per_record = header['samples_per_record'][channel_idx]
        total_samples_per_record = sum(header['samples_per_record'])
        sfreq = sig_samples_per_record / header['record_duration']
        
        phys_min = header['phys_min'][channel_idx]
        phys_max = header['phys_max'][channel_idx]
        dig_min = header['dig_min'][channel_idx]
        dig_max = header['dig_max'][channel_idx]
        
        scale = (phys_max - phys_min) / (dig_max - dig_min)
        offset = phys_min - scale * dig_min
        
        bytes_per_record = total_samples_per_record * 2
        bytes_before = sum(header['samples_per_record'][:channel_idx]) * 2
        bytes_after = bytes_per_record - bytes_before - sig_samples_per_record * 2
        
        samples = []
        record_idx = 0
        
        while len(samples) < max_samples:
            if header['num_records'] != -1 and record_idx >= header['num_records']:
                break
                
            block = fh.read(bytes_per_record)
            if len(block) < bytes_per_record:
                break
                
            if bytes_before:
                block = block[bytes_before:]
            if bytes_after:
                block = block[:-bytes_after]
                
            data = array.array("h")
            data.frombytes(block)
            
            for value in data:
                if len(samples) >= max_samples:
                    break
                samples.append(float(scale * value + offset))
                
            record_idx += 1
        
        return np.array(samples), sfreq, header['labels'][channel_idx]

WINDOW_SECONDS = 60
PLOT_UPDATE_INTERVAL = 0.1  # seconds between plot updates (~10 FPS; data still advances at 100Hz)

def generate_eeg_plot(samples, sfreq, channel_label, time_start_sec=0):
    """Generate matplotlib plot of EEG data with power spectrum.
    time_start_sec: start time of this window in the recording (for x-axis labels).
    """
    # Create figure with 2 subplots
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8))
    fig.suptitle(f'EEG Analysis - {channel_label}', fontsize=14, fontweight='bold')
    
    # Plot 1: Time-domain signal (WINDOW_SECONDS second window)
    display_samples = min(int(WINDOW_SECONDS * sfreq), len(samples))
    # X-axis: show actual time interval in recording (e.g. 10s - 30s)
    time_axis = time_start_sec + np.arange(display_samples) / sfreq
    ax1.plot(time_axis, samples[:display_samples], 'b-', linewidth=0.5)
    ax1.set_xlabel('Time (seconds into recording)')
    ax1.set_ylabel('Amplitude (µV)')
    time_end = time_start_sec + display_samples / sfreq
    ax1.set_title(f'EEG Signal ({WINDOW_SECONDS}s window) — {time_start_sec:.1f}s to {time_end:.1f}s')
    ax1.grid(True, alpha=0.3)
    # X-axis ticks: 5 evenly spaced labels showing time interval (e.g. 0, 5, 10, 15, 20)
    ax1.set_xticks(np.linspace(time_start_sec, time_end, 5))
    ax1.set_xlim(time_start_sec, time_end)
    ax1.tick_params(axis='x', which='major', labelsize=9)
    
    # Plot 2: Power spectrum
    if len(samples) > 100:
        # Apply Hanning window
        window = np.hanning(len(samples))
        windowed = samples * window
        
        # Compute FFT
        freqs = np.fft.rfftfreq(len(windowed), d=1.0/sfreq)
        spectrum = np.abs(np.fft.rfft(windowed)) ** 2
        
        # Plot spectrum
        ax2.semilogy(freqs, spectrum, 'k-', linewidth=1, alpha=0.7)
        
        # Add colored bands for frequency ranges
        bands = [
            (0.5, 4.0, 'Delta', (0.2, 0.4, 0.8)),
            (4.0, 8.0, 'Theta', (0.4, 0.6, 0.9)),
            (8.0, 13.0, 'Alpha', (0.9, 0.5, 0.1)),
            (13.0, 30.0, 'Beta', (0.8, 0.2, 0.2))
        ]
        
        for low, high, name, color in bands:
            mask = (freqs >= low) & (freqs <= high)
            if np.any(mask):
                ax2.fill_between(freqs[mask], 1, spectrum[mask], 
                                alpha=0.3, color=color, label=name)
        
        ax2.set_xlabel('Frequency (Hz)')
        ax2.set_ylabel('Power')
        ax2.set_title('Power Spectrum')
        ax2.set_xlim(0, 35)
        ax2.legend()
        ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    # Save to bytes buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    buf.seek(0)
    plt.close(fig)
    
    return buf

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    printDebug("LOGIN REQUEST:")
    printDebug(f"\tUsername: {username}")
    printDebug(f"\tPassword: {password}")

    printDebug(f"Verification: {authenticate(username, password)}")
    if authenticate(username, password):
        return jsonify({"success": 1, "message": "Login successful", "sessions": crypto_ops.decrypt_sessions()}), 200
    else:
        return jsonify({"success": 0, "message": "Invalid credentials"}), 200

@app.route('/api/create-account', methods=['POST'])
def create_account():
    """Create a new user account and save as .USR file"""
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    
    printDebug("CREATE ACCOUNT REQUEST:")
    printDebug(f"\tUsername: {username}")
    
    # Validation
    if not username:
        return jsonify({"success": False, "error": "Username is required"}), 400
    
    if not password or len(password) < 6:
        return jsonify({"success": False, "error": "Password must be at least 6 characters"}), 400
    
    try:
        success:bool = create_usr_file(username, password)
        print(success)
        if (success):
            printDebug(f"Created user file: {username}")
            print("Got Here")
            return jsonify({
            "success": True,
            "message": f"Account '{username}' created successfully"}), 200
        else:
            print("IDK")
            return jsonify({
                "success": False,
                "message": f"Account '{username}' already exists"
            }), 200
        
    except Exception as e:
        printDebug(f"Error creating account: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": f"Failed to create account: {str(e)}"}), 500


# Parser migration: endpoint for frontend to send raw RDF content and get parsed Modbus data
@app.route('/api/modbus/parse', methods=['POST'])
def api_modbus_parse():
    """
    Frontend sends the raw content from Solid Pod; backend does the parsing.
    """
    try:
        data = request.get_json()
        if data is None:
            return jsonify({"error": "Request body must be JSON"}), 400

        content = data.get("content")
        if content is None:
            return jsonify({"error": "Missing 'content' in request body"}), 400

        if not isinstance(content, str):
            return jsonify({"error": "'content' must be a string"}), 400

        result = parse_modbus_data(content)
        return jsonify(result), 200

    except Exception as e:
        printDebug(f"Error in /api/modbus/parse: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


def iter_edf_samples_continuously(edf_path, channel_idx=0):
    """Generator that yields EDF samples one at a time"""
    with open(edf_path, 'rb') as fh:
        header = read_edf_header(fh)
        
        sig_samples_per_record = header['samples_per_record'][channel_idx]
        total_samples_per_record = sum(header['samples_per_record'])
        sfreq = sig_samples_per_record / header['record_duration']
        
        phys_min = header['phys_min'][channel_idx]
        phys_max = header['phys_max'][channel_idx]
        dig_min = header['dig_min'][channel_idx]
        dig_max = header['dig_max'][channel_idx]
        
        scale = (phys_max - phys_min) / (dig_max - dig_min)
        offset = phys_min - scale * dig_min
        
        bytes_per_record = total_samples_per_record * 2
        bytes_before = sum(header['samples_per_record'][:channel_idx]) * 2
        bytes_after = bytes_per_record - bytes_before - sig_samples_per_record * 2
        
        record_idx = 0
        
        while True:
            if header['num_records'] != -1 and record_idx >= header['num_records']:
                break
                
            block = fh.read(bytes_per_record)
            if len(block) < bytes_per_record:
                break
                
            if bytes_before:
                block = block[bytes_before:]
            if bytes_after:
                block = block[:-bytes_after]
                
            data = array.array("h")
            data.frombytes(block)
            
            for value in data:
                yield float(scale * value + offset)
                
            record_idx += 1

def _is_live_mode() -> bool:
    """True when request asks for live (BLE) data; False for review (EDF file). Default is live."""
    return request.args.get('mode', 'live').lower() == 'live'


@app.route('/api/edf/stream', methods=['GET'])
def stream_edf_data():
    """Stream EDF data in real-time. mode=live (default): from BLE. mode=review: from EDF file."""
    live = _is_live_mode()

    def generate():
        import time
        import json

        try:
            if live:
                # Live mode: yield samples from Bluetooth capture
                printDebug("EDF stream: using BLE data (live mode)")
                sample_count = 0
                start_time = time.time()
                last_len = 0
                while True:
                    with _bluetooth_samples_lock:
                        n = len(_bluetooth_samples)
                        if n > last_len:
                            new_samples = _bluetooth_samples[last_len:n]
                            last_len = n
                        else:
                            new_samples = []
                    for value in new_samples:
                        elapsed = time.time() - start_time
                        data_point = {
                            'value': value,
                            'timestamp': elapsed,
                            'sample': sample_count
                        }
                        yield f"data: {json.dumps(data_point)}\n\n"
                        sample_count += 1
                    time.sleep(0.01)
                    if time.time() - start_time > 3600:
                        break
                return

            # Review mode: stream from EDF file
            edf_files = list(SESSIONS_DIR.glob('*.edf'))
            if not edf_files:
                yield f"data: {json.dumps({'error': 'No EDF files found'})}\n\n"
                return
            
            edf_file = edf_files[0]
            printDebug(f"Starting real-time stream from: {edf_file.name}")
            
            sample_count = 0
            start_time = time.time()
            
            # Stream samples at 100Hz (10ms per sample)
            for value in iter_edf_samples_continuously(str(edf_file), channel_idx=0):
                elapsed = time.time() - start_time
                
                data_point = {
                    'value': value,
                    'timestamp': elapsed,
                    'sample': sample_count
                }
                
                yield f"data: {json.dumps(data_point)}\n\n"
                
                sample_count += 1
                
                # Throttle to 100Hz (sleep 10ms between samples)
                time.sleep(0.01)
                
                # Optional: limit total streaming time
                if elapsed > 3600:  # Stop after 1 hour
                    break
                    
        except Exception as e:
            printDebug(f"Error in stream: {e}")
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    from flask import Response
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/edf/plot', methods=['GET'])
def get_edf_plot():
    """Generate matplotlib plot. mode=live: BLE samples. mode=review: EDF file."""
    try:
        if _is_live_mode():
            with _bluetooth_samples_lock:
                samples = list(_bluetooth_samples)[-(int(WINDOW_SECONDS * 100)):]
            if len(samples) < 10:
                return jsonify({"error": "Not enough BLE samples yet (live mode)"}), 503
            sfreq = 100.0
            channel_label = "BLE"
            img_buffer = generate_eeg_plot(samples, sfreq, channel_label)
            return send_file(img_buffer, mimetype='image/png')

        if not SESSIONS_DIR.exists():
            return jsonify({"error": "Sessions directory not found"}), 404
        
        edf_files = list(SESSIONS_DIR.glob('*.edf'))
        if not edf_files:
            return jsonify({"error": "No EDF files found"}), 404
        
        edf_file = edf_files[0]
        # Read 60 seconds of data (6000 samples at 100Hz)
        samples, sfreq, channel_label = read_edf_samples(str(edf_file), channel_idx=0, max_samples=int(WINDOW_SECONDS * sfreq))
        
        if len(samples) == 0:
            return jsonify({"error": "No samples read"}), 500
        
        img_buffer = generate_eeg_plot(samples, sfreq, channel_label)
        return send_file(img_buffer, mimetype='image/png')
        
    except Exception as e:
        printDebug(f"Error generating plot: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/edf/plot/stream', methods=['GET'])
def stream_edf_plot():
    """Stream matplotlib plots. mode=live: BLE data. mode=review: EDF file."""
    import json as _json
    from flask import Response

    live = _is_live_mode()
    if live:
        channel_label = "BLE"
        sfreq = 100.0
        edf_path = None
        edf_file = None
    else:
        try:
            username = request.args.get('username', 'demo')
            edf_file = get_edf_file_for_user(username)
            with open(str(edf_file), 'rb') as fh:
                header = read_edf_header(fh)
            channel_label = header['labels'][0]
            sfreq = header['samples_per_record'][0] / header['record_duration']
            edf_path = str(edf_file)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response(
                f"data: {_json.dumps({'error': str(e)})}\n\n",
                mimetype='text/event-stream',
                headers={'Cache-Control': 'no-cache'}
            )

    def generate():
        import time
        import json
        window_samples = min(int(WINDOW_SECONDS * sfreq), 8000)  # allow up to 80s at 100Hz; WINDOW_SECONDS=60 → 6000
        samples_per_update = max(1, int(sfreq * PLOT_UPDATE_INTERVAL))
        buffer = []
        total_samples_read = 0
        update_count = 0
        last_len = 0
        if live:
            printDebug("Plot stream: using BLE data (live mode)")
        else:
            printDebug(f"Plot stream: {edf_file.name} at {sfreq} Hz, plot every {PLOT_UPDATE_INTERVAL}s")
        sample_iter = None if live else iter_edf_samples_continuously(edf_path, channel_idx=0)

        while True:
            if live:
                with _bluetooth_samples_lock:
                    n = len(_bluetooth_samples)
                    if n > last_len:
                        new_part = _bluetooth_samples[last_len:n]
                        last_len = n
                    else:
                        new_part = []
                for v in new_part:
                    buffer.append(v)
                    total_samples_read += 1
                if len(buffer) > window_samples:
                    buffer = buffer[-window_samples:]
            else:
                for _ in range(samples_per_update):
                    try:
                        buffer.append(next(sample_iter))
                        total_samples_read += 1
                    except StopIteration:
                        yield f"data: {json.dumps({'done': True})}\n\n"
                        return
                if len(buffer) > window_samples:
                    buffer = buffer[-window_samples:]

            if len(buffer) < 10:
                time.sleep(PLOT_UPDATE_INTERVAL)
                continue
            time_start_sec = max(0, (total_samples_read - len(buffer)) / sfreq)
            buf_arr = np.array(buffer, dtype=float)
            try:
                img_buffer = generate_eeg_plot(buf_arr, sfreq, channel_label, time_start_sec=time_start_sec)
                img_buffer.seek(0)
                b64 = base64.b64encode(img_buffer.read()).decode('utf-8')
                yield f"data: {json.dumps({'image': f'data:image/png;base64,{b64}', 'samples': len(buffer)})}\n\n"
                update_count += 1
                if update_count % 50 == 0:
                    printDebug(f"Plot stream: sent {update_count} updates")
            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'error': f'Plot gen: {e}'})}\n\n"
            time.sleep(PLOT_UPDATE_INTERVAL)
            if update_count > 36000:
                break

    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
    })

@app.route('/api/bluetooth/hex', methods=['GET'])
def get_bluetooth_hex():
    """Return recent hex lines captured from the Bluetooth (Desktop) subprocess stdout."""
    n = min(int(request.args.get("n", 100)), BLUETOOTH_HEX_MAX_LINES)
    lines = list(_bluetooth_hex_lines)[-n:]
    return jsonify({
        "success": True,
        "lines": [{"raw": x["raw"], "hex": x["hex"]} for x in lines],
        "count": len(lines)
    }), 200

@app.route('/api/bluetooth/samples', methods=['GET'])
def get_bluetooth_samples():
    """Return recent parsed numeric samples from BLE characteristic values (for debugging)."""
    n = min(int(request.args.get("n", 1000)), BLUETOOTH_SAMPLES_MAX)
    with _bluetooth_samples_lock:
        samples = _bluetooth_samples[-n:] if _bluetooth_samples else []
    return jsonify({
        "success": True,
        "samples": samples,
        "count": len(samples)
    }), 200

@app.route('/api/sessions/list', methods=['GET'])
def list_sessions():
    """List EDF files in backend/sessions/ for Review mode."""
    try:
        if not SESSIONS_DIR.exists():
            return jsonify({"success": True, "sessions": []}), 200
        edf_files = sorted(SESSIONS_DIR.glob("*.edf"))
        sessions = []
        for path in edf_files:
            try:
                startdate, starttime, duration_sec = get_edf_start_and_duration(path)
                # Parse dd.mm.yy and hh.mm.ss (only if numeric to avoid e.g. 'male_33y')
                from datetime import datetime
                parts_d = startdate.split(".")
                parts_t = starttime.split(".")
                day = int(parts_d[0]) if len(parts_d) >= 1 and parts_d[0].strip().isdigit() else 1
                month = int(parts_d[1]) if len(parts_d) >= 2 and parts_d[1].strip().isdigit() else 1
                yy = int(parts_d[2]) if len(parts_d) >= 3 and parts_d[2].strip().isdigit() else 0
                year = (1900 + yy) if yy >= 80 else (2000 + yy) if yy < 100 else 2000
                hour = int(parts_t[0]) if len(parts_t) >= 1 and parts_t[0].strip().isdigit() else 0
                min_ = int(parts_t[1]) if len(parts_t) >= 2 and parts_t[1].strip().isdigit() else 0
                sec = int(parts_t[2]) if len(parts_t) >= 3 and parts_t[2].strip().isdigit() else 0
                start_dt = datetime(year, month, day, hour, min_, sec)
                end_dt = datetime.fromtimestamp(start_dt.timestamp() + duration_sec)
                start_iso = start_dt.isoformat() + "Z"
                end_iso = end_dt.isoformat() + "Z"
                date_str = start_dt.strftime("%Y-%m-%d")
                hour_range = start_dt.strftime("%I:%M %p") + " – " + end_dt.strftime("%I:%M %p")
            except Exception:
                start_iso = ""
                end_iso = ""
                date_str = path.stem
                hour_range = "—"
            sessions.append({
                "id": path.name,
                "filename": path.name,
                "deviceId": path.stem,
                "startTime": start_iso,
                "endTime": end_iso,
                "date": date_str,
                "hourRange": hour_range,
            })
        return jsonify({"success": True, "sessions": sessions}), 200
    except Exception as e:
        printDebug(f"Error listing sessions: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/sessions/<session_id>/data', methods=['GET'])
def get_session_data(session_id: str):
    """Load one EDF session by filename (id) for Review mode. Returns timestamps and channelData."""
    import datetime as dt
    try:
        # Restrict to files in SESSIONS_DIR (no path traversal)
        if ".." in session_id or "/" in session_id or "\\" in session_id:
            return jsonify({"success": False, "error": "Invalid session id"}), 400
        path = SESSIONS_DIR / session_id
        if not path.exists() or not path.suffix.lower() == ".edf":
            return jsonify({"success": False, "error": "Session not found"}), 404
        # Load entire file when no window specified: use EDF length from header
        with open(path, 'rb') as fh:
            header = read_edf_header(fh)
        num_records = header['num_records']
        samples_per_sig = header['samples_per_record'][0]
        if num_records > 0:
            total_in_file = num_records * samples_per_sig
            # Cap at 24 h at 512 Hz to avoid huge payloads
            max_samples = min(total_in_file, 24 * 3600 * 512)
        else:
            max_samples = 500000
        # Load at native rate then downsample to 1 sample per second for Review
        samples_arr, sfreq, channel_label = read_edf_samples(str(path), channel_idx=0, max_samples=max_samples)
        n_native = len(samples_arr)
        step = max(1, int(round(sfreq)))  # 1 sample per second: take every sfreq-th sample
        indices = list(range(0, n_native, step))
        if indices and indices[-1] != n_native - 1:
            indices.append(n_native - 1)
        samples = [float(samples_arr[i]) for i in indices]
        n_seconds = len(samples)
        with open(path, 'rb') as fh:
            header = read_edf_header(fh)
        startdate, starttime, _ = get_edf_start_and_duration(path)
        try:
            parts_d = startdate.split(".")
            parts_t = starttime.split(".")
            day = int(parts_d[0]) if len(parts_d) >= 1 and parts_d[0].strip().isdigit() else 1
            month = int(parts_d[1]) if len(parts_d) >= 2 and parts_d[1].strip().isdigit() else 1
            yy = int(parts_d[2]) if len(parts_d) >= 3 and parts_d[2].strip().isdigit() else 0
            year = (1900 + yy) if yy >= 80 else (2000 + yy) if yy < 100 else 2000
            hour = int(parts_t[0]) if len(parts_t) >= 1 and parts_t[0].strip().isdigit() else 0
            min_ = int(parts_t[1]) if len(parts_t) >= 2 and parts_t[1].strip().isdigit() else 0
            sec = int(parts_t[2]) if len(parts_t) >= 3 and parts_t[2].strip().isdigit() else 0
            start_dt = dt.datetime(year, month, day, hour, min_, sec)
        except (ValueError, TypeError):
            start_dt = dt.datetime(2000, 1, 1, 0, 0, 0)
        # Timestamps at 1-second intervals
        start_ms = int(start_dt.timestamp() * 1000)
        timestamps_ms = [start_ms + i * 1000 for i in range(n_seconds)]
        channel_data = [[s] for s in samples]
        # Build mock sleep stages for the loaded duration (review = realistic proportions)
        start_ts = start_ms
        duration_ms = n_seconds * 1000
        end_ts = start_ts + duration_ms
        stage_sequence = [
            {"type": "awake", "duration": 0.1},
            {"type": "light", "duration": 0.3},
            {"type": "deep", "duration": 0.25},
            {"type": "light", "duration": 0.15},
            {"type": "rem", "duration": 0.2},
        ]
        stages_out = []
        t = start_ts
        idx = 0
        while t < end_ts:
            st = stage_sequence[idx % len(stage_sequence)]
            dur_ms = duration_ms * st["duration"]
            stage_end = min(t + dur_ms, end_ts)
            stages_out.append({
                "type": st["type"],
                "startTime": dt.datetime.utcfromtimestamp(t / 1000).isoformat() + "Z",
                "endTime": dt.datetime.utcfromtimestamp(stage_end / 1000).isoformat() + "Z",
                "duration": (stage_end - t) / (60 * 1000),
            })
            t = stage_end
            idx += 1
            if t >= end_ts:
                break
        return jsonify({
            "success": True,
            "id": session_id,
            "startTime": dt.datetime.utcfromtimestamp(start_ts / 1000).isoformat() + "Z",
            "endTime": dt.datetime.utcfromtimestamp(end_ts / 1000).isoformat() + "Z",
            "deviceId": path.stem,
            "timestamps": timestamps_ms,
            "channelData": channel_data,
            "sleepStages": stages_out,
            "quality": "good",
            "sessionType": "night",
        }), 200
    except Exception as e:
        printDebug(f"Error loading session {session_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/device/scan', methods=['POST'])
def device_scan():
    """Send a scan command to main.exe stdin, optionally with debug flag."""
    data = request.get_json(silent=True) or {}
    debug = bool(data.get("debug"))
    cmd = "scan --debug" if debug else "scan"

    ok = send_desktop_command(cmd)
    if ok:
        return jsonify({"success": True, "message": "scan sent to Desktop client"}), 200
    # If the process isn't running yet, try to start it first then retry
    started = launch_desktop_client()
    if started:
        import time; time.sleep(0.5)   # brief pause for init
        ok = send_desktop_command(cmd)
    if ok:
        return jsonify({"success": True, "message": "scan sent to Desktop client"}), 200
    return jsonify({"success": False, "error": "Desktop client not running"}), 503


@app.route('/api/edf/info', methods=['GET'])
def get_edf_info():
    """Get EDF info. mode=live (default): BLE placeholder. mode=review: EDF file metadata."""
    try:
        if _is_live_mode():
            return jsonify({
                "success": True,
                "filename": "BLE (live from Bluetooth)",
                "num_signals": 1,
                "labels": ["BLE"],
                "sampling_rate": 100.0
            }), 200
        username = request.args.get('username', 'demo')
        edf_file = get_edf_file_for_user(username)
        with open(str(edf_file), 'rb') as fh:
            header = read_edf_header(fh)
        return jsonify({
            "success": True,
            "filename": edf_file.name,
            "num_signals": header['num_signals'],
            "labels": header['labels'],
            "sampling_rate": header['samples_per_record'][0] / header['record_duration']
        }), 200
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    for arg in sys.argv[1:]:
        if arg == "--debug":
            debug.setDebug(debug.DEBUG)
        if arg == "--debug-gui":
            debug.setDebug(debug.DEBUG | debug.GUI)

    print("Back end running\n\tDO NOT CLOSE THIS WINDOW!!!")
    print(f"Sessions directory: {SESSIONS_DIR.absolute()}")

    if SESSIONS_DIR.exists():
        edf_count = len(list(SESSIONS_DIR.glob('*.edf')))
        print(f"Found {edf_count} EDF file(s) in sessions directory")
    else:
        print(f"WARNING: Sessions directory does not exist!")

    # Launch Desktop client (CommunicationManager) as a managed subprocess.
    # use_reloader=False prevents Flask from forking twice and starting two clients.
    launch_desktop_client()

    app.run(debug=True, port=5000, use_reloader=False)
