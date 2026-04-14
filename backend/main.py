from __future__ import annotations
import sys
import json
import time
import re
from pathlib import Path
from typing import Dict, Any, List, Tuple, Union
import logging

from flask import Flask, request, jsonify, send_file, Response, cli
from flask_cors import CORS

import debug
import crypto_ops
import ble_comms
import data_processor

app: Flask = Flask(__name__)
CORS(app)

# Backend folder layout:
# - backend/sessions: demo EDF files + encrypted .eeg sessions
# - backend/user: encrypted .USR credential files (used to derive the per-user key)
BACKEND_DIR: Path = Path(__file__).parent
SESSIONS_DIR: Path = BACKEND_DIR / "sessions"

def _is_live_mode() -> bool:
    """
    Decide whether endpoints should serve:
    - **live**: realtime samples coming from the DreamR device over BLE (via Desktop client)
    - **review**: replay samples from files (EDF demo files / encrypted sessions)
    
    The frontend toggles this via `?mode=live` or `?mode=review`.
    """
    return request.args.get('mode', 'live').lower() == 'live'


_MAC_REGEX = re.compile(r"^(?:[0-9A-Fa-f]{2}([-:]))(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}$")


def _normalize_mac_address(raw: str) -> str:
    """Normalize a MAC string to AA:BB:CC:DD:EE:FF and validate format."""
    s = raw.strip()
    if not _MAC_REGEX.fullmatch(s):
        raise ValueError("MAC address must be in format AA:BB:CC:DD:EE:FF (or with '-')")
    parts = re.split(r"[:-]", s)
    return ":".join(p.upper() for p in parts)

@app.route('/api/login', methods=['POST'])
def login() -> Tuple[Response, int]:
    data: Dict[str, Any] = request.get_json() or {}
    username: str = data.get('username', '')
    password: str = data.get('password', '')
    
    # IMPORTANT: `crypto_ops.authenticate` derives and stores a global USR_KEY.
    # That key is later used by `/api/sessions/save` to encrypt `.eeg` session files.
    if crypto_ops.authenticate(username, password):
        return jsonify({
            "success": 1, 
            "message": "Login successful", 
            "sessions": crypto_ops.list_user_sessions()
        }), 200
    return jsonify({"success": 0, "message": "Invalid credentials"}), 200

@app.route('/api/create-account', methods=['POST'])
def create_account() -> Tuple[Response, int]:
    data: Dict[str, Any] = request.get_json() or {}
    user: str = data.get('username', '').strip()
    pwd: str = data.get('password', '').strip()
    
    if not user: 
        return jsonify({"success": False, "error": "Username is required"}), 400
    if not pwd or len(pwd) < 6: 
        return jsonify({"success": False, "error": "Password must be at least 6 characters"}), 400
    
    try:
        if crypto_ops.create_usr_file(user, pwd):
            return jsonify({"success": True, "message": f"Account '{user}' created successfully"}), 200
        return jsonify({"success": False, "message": f"Account '{user}' already exists"}), 200
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to create account: {str(e)}"}), 500

@app.route('/api/edf/stream', methods=['GET'])
def stream_edf_data() -> Response:
    try:
        if _is_live_mode():
            # Server-Sent Events (SSE): the generator yields `data: <json>\n\n`.
            # The frontend uses EventSource to receive a continuous stream.
            generator = ble_comms.stream_live_data()
        else:
            edf_files: List[Path] = list(SESSIONS_DIR.glob('*.edf'))
            if not edf_files: 
                return Response(f"data: {json.dumps({'error': 'No EDF files found'})}\n\n", mimetype='text/event-stream')
            generator = data_processor.stream_edf_data(edf_files[0])
            
        return Response(generator, mimetype='text/event-stream')
    except Exception as e:
        return Response(f"data: {json.dumps({'error': str(e)})}\n\n", mimetype='text/event-stream')

@app.route('/api/edf/plot', methods=['GET'])
def get_edf_plot() -> Union[Response, Tuple[Response, int]]:
    try:
        if _is_live_mode():
            # Snapshot the most recent window of samples from the shared BLE buffer.
            # Lock is needed because another thread is appending to the list.
            with ble_comms.bluetooth_samples_lock:
                samples: List[float] = list(ble_comms.bluetooth_samples)[-(int(data_processor.WINDOW_SECONDS * 100)):]
            if len(samples) < 10: 
                return jsonify({"error": "Not enough BLE samples yet"}), 503
            img_buffer = data_processor.generate_eeg_plot(samples, 100.0, "BLE")
            return send_file(img_buffer, mimetype='image/png')

        edf_files: List[Path] = list(SESSIONS_DIR.glob('*.edf'))
        if not edf_files: 
            return jsonify({"error": "No EDF files found"}), 404
        
        file_samples, sfreq, channel_label = data_processor.read_edf_samples(str(edf_files[0]), max_samples=int(data_processor.WINDOW_SECONDS * 100))
        img_buffer = data_processor.generate_eeg_plot(file_samples, sfreq, channel_label)
        return send_file(img_buffer, mimetype='image/png')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/edf/plot/stream', methods=['GET'])
def stream_edf_plot() -> Response:
    live: bool = _is_live_mode()
    username: str = request.args.get('username', 'demo')
    
    # This endpoint sends periodic plot images as base64-encoded PNGs over SSE.
    # Rationale: it keeps the frontend simple (no FFT/plotting in the browser) at the cost
    # of higher bandwidth than streaming raw samples.
    generator = data_processor.generate_plot_stream(live, username, get_ble_samples_cb=ble_comms.get_new_samples)
    return Response(generator, mimetype='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

@app.route('/api/bluetooth/hex', methods=['GET'])
def get_bluetooth_hex() -> Tuple[Response, int]:
    n: int = min(int(request.args.get("n", 100)), ble_comms.BLUETOOTH_HEX_MAX_LINES)
    lines: List[Dict[str, str]] = list(ble_comms.bluetooth_hex_lines)[-n:]
    return jsonify({"success": True, "lines": [{"raw": x["raw"], "hex": x["hex"]} for x in lines], "count": len(lines)}), 200

@app.route('/api/bluetooth/samples', methods=['GET'])
def get_bluetooth_samples() -> Tuple[Response, int]:
    n: int = min(int(request.args.get("n", 1000)), ble_comms.BLUETOOTH_SAMPLES_MAX)
    samples: List[float] = []
    with ble_comms.bluetooth_samples_lock:
        samples = ble_comms.bluetooth_samples[-n:] if ble_comms.bluetooth_samples else []
    return jsonify({"success": True, "samples": samples, "count": len(samples)}), 200

@app.route('/api/live/export', methods=['POST'])
def export_live_csv() -> Tuple[Response, int]:
    try:
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        samples: List[float] = []
        with ble_comms.bluetooth_samples_lock:
            samples = list(ble_comms.bluetooth_samples)

        if not samples: 
            return jsonify({"success": False, "error": "No BLE samples available"}), 400

        name: str
        path: str
        # Exports are intentionally unencrypted CSVs for easy analysis in Excel/Python.
        # Encrypted session saving is handled separately by `/api/sessions/save`.
        name, path = data_processor.export_csv(
            samples, 
            payload.get("username", ""), 
            payload.get("filename", ""), 
            float(payload.get("sampling_rate", 100.0)),
            payload.get("output_dir", "")
        )
        return jsonify({"success": True, "filename": name, "path": path, "samples": len(samples)}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/sessions/save', methods=['POST'])
def save_encrypted_session() -> Tuple[Response, int]:
    """Persist live BLE samples as an encrypted .eeg file (requires successful /api/login for USR_KEY)."""
    try:
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        username: str = str(payload.get("username", "") or "")
        sampling_rate: float = float(payload.get("sampling_rate", 100.0))
        samples: List[float] = []
        with ble_comms.bluetooth_samples_lock:
            samples = list(ble_comms.bluetooth_samples)

        if not samples:
            return jsonify({"success": False, "error": "No BLE samples available"}), 400

        # `.eeg` is an app-specific encrypted blob:
        #   nonce(16) + tag(16) + ciphertext(JSON session payload)
        # The encryption key is derived during `/api/login`.
        filename: str = data_processor.save_eeg(samples, username, sampling_rate)
        return jsonify({"success": True, "filename": filename, "samples": len(samples)}), 200
    except RuntimeError as e:
        return jsonify({"success": False, "error": str(e)}), 503
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/system/select-folder', methods=['GET'])
def select_folder() -> Tuple[Response, int]:
    try:
        # Native folder picker for local desktop usage.
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        selected = filedialog.askdirectory(title='Select Export Folder')
        root.destroy()

        if not selected:
            return jsonify({"success": False, "cancelled": True}), 200
        return jsonify({"success": True, "path": selected}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
@app.route('/api/sessions/list', methods=['GET'])
def list_sessions() -> Tuple[Response, int]:
    try:
        # Returns a normalized list for the frontend session browser.
        # It can include both decrypted `.eeg` sessions and demo `.edf` files.
        return jsonify({"success": True, "sessions": data_processor.get_all_sessions_info()}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/sessions/<session_id>/data', methods=['GET'])
def get_session_data(session_id: str) -> Tuple[Response, int]:
    try:
        # This is the "review mode" payload: timestamps + downsampled channelData + sleep stages.
        return jsonify(data_processor.get_session_data_payload(session_id)), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/device/scan', methods=['POST'])
def device_scan() -> Tuple[Response, int]:
    """Desktop main.exe only accepts a single token per line (see Desktop.cpp); always send 'scan'."""
    cmd: str = "scan"
    
    if ble_comms.send_desktop_command(cmd):
        return jsonify({"success": True, "message": "scan sent to Desktop client"}), 200
        
    if ble_comms.launch_desktop_client():
        time.sleep(0.5)
        if ble_comms.send_desktop_command(cmd):
            return jsonify({"success": True, "message": "scan sent to Desktop client"}), 200
    return jsonify({"success": False, "error": "Desktop client not running"}), 503


@app.route('/api/device/connect', methods=['POST'])
def device_connect() -> Tuple[Response, int]:
    """Connect to a specific BLE device by MAC address using Desktop.cpp's connectaddress flow."""
    data: Dict[str, Any] = request.get_json(silent=True) or {}
    raw_mac: str = str(data.get("mac_address") or data.get("address") or "").strip()
    if not raw_mac:
        return jsonify({"success": False, "error": "mac_address is required"}), 400
    try:
        mac_address: str = _normalize_mac_address(raw_mac)
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400

    # Desktop client protocol is line-oriented commands via stdin:
    # - connectaddress
    # - <MAC>
    commands: List[str] = ["connectaddress", mac_address]

    if ble_comms.send_desktop_commands(commands):
        return jsonify({"success": True, "message": "connectaddress sent to Desktop client", "mac_address": mac_address}), 200

    if ble_comms.launch_desktop_client():
        time.sleep(0.5)
        if ble_comms.send_desktop_commands(commands):
            return jsonify({"success": True, "message": "connectaddress sent to Desktop client", "mac_address": mac_address}), 200
    return jsonify({"success": False, "error": "Desktop client not running"}), 503

@app.route('/api/edf/info', methods=['GET'])
def get_edf_info() -> Tuple[Response, int]:
    try:
        if _is_live_mode():
            return jsonify({"success": True, "filename": "BLE (live from Bluetooth)", "num_signals": 1, "labels": ["BLE"], "sampling_rate": 100.0}), 200
        username: str = request.args.get('username', 'demo')
        edf_file: Path = data_processor.get_edf_file_for_user(username)
        with open(str(edf_file), 'rb') as fh: 
            header: Dict[str, Any] = data_processor.read_edf_header(fh)
        return jsonify({"success": True, "filename": edf_file.name, "num_signals": header['num_signals'], "labels": header['labels'], "sampling_rate": header['samples_per_record'][0] / header['record_duration']}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    for arg in sys.argv[1:]:
        if arg == "--debug":
            debug.setDebug(debug.DEBUG)
        if arg == "--debug-gui":
            debug.setDebug(debug.DEBUG | debug.GUI)

    print("DreamRT Back end running\n\tDO NOT CLOSE THIS WINDOW!!!")
    if debug.getDebug():
        print(f"Sessions directory: {SESSIONS_DIR.absolute()}")
        _edf_list = list(SESSIONS_DIR.glob("*.edf"))
        print(f"Found {len(_edf_list)} EDF file(s) in sessions directory")
    else:
        cli.show_server_banner = lambda *args: None
        _wk = logging.getLogger("werkzeug")
        _wk.disabled = True
        _wk.setLevel(logging.ERROR)

    # Start the Desktop BLE bridge client up front so the UI can immediately "scan/connect"
    # without manually launching a separate executable.
    ble_comms.launch_desktop_client()
    app.run(debug=bool(debug.getDebug()), port=5000, use_reloader=False)