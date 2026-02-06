import sys
import array
import io
import base64
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
from crypto_usr_test import authenticate, create_user_file
import glob

app = Flask(__name__)
CORS(app)  # Enables the React frontend to talk to this Python backend

# Get the directory where this script is located
BACKEND_DIR = Path(__file__).parent
SESSIONS_DIR = BACKEND_DIR / "sessions"
USER_DIR = BACKEND_DIR / "user"

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

def username_exists(username: str) -> bool:
    """Check if a username already exists by checking .USR filenames"""
    if not USER_DIR.exists():
        return False
    
    # Check if a file with this username exists (case-insensitive)
    username_lower = username.lower()
    usr_files = glob.glob(str(USER_DIR / "*.USR"))
    
    for file_path in usr_files:
        file_username = Path(file_path).stem.lower()
        if file_username == username_lower:
            return True
    
    return False

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

WINDOW_SECONDS = 5
PLOT_UPDATE_INTERVAL = 0.1  # seconds between plot updates (~10 FPS; data still advances at 100Hz)

def generate_eeg_plot(samples, sfreq, channel_label, time_start_sec=0):
    """Generate matplotlib plot of EEG data with power spectrum.
    time_start_sec: start time of this window in the recording (for x-axis labels).
    """
    # Create figure with 2 subplots
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8))
    fig.suptitle(f'EEG Analysis - {channel_label}', fontsize=14, fontweight='bold')
    
    # Plot 1: Time-domain signal (5 second window)
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
        return jsonify({"success": 1, "message": "Login successful"}), 200
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
    
    # Check if username already exists
    if username_exists(username):
        return jsonify({"success": False, "error": "Username already exists"}), 400
    
    try:
        # Ensure user directory exists
        USER_DIR.mkdir(exist_ok=True)
        
        # Create the .USR file - use absolute path
        filename = str(USER_DIR / f"{username}.USR")
        create_user_file(username, password, filename)
        
        printDebug(f"Created user file: {filename}")
        
        return jsonify({
            "success": True,
            "message": f"Account '{username}' created successfully"
        }), 200
        
    except Exception as e:
        printDebug(f"Error creating account: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": f"Failed to create account: {str(e)}"}), 500

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

@app.route('/api/edf/stream', methods=['GET'])
def stream_edf_data():
    """Stream EDF data in real-time at 100Hz"""
    def generate():
        import time
        import json
        
        try:
            # Get first EDF file
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
    """Generate matplotlib plot (EEG signal + power spectrum) and return as PNG"""
    try:
        if not SESSIONS_DIR.exists():
            return jsonify({"error": "Sessions directory not found"}), 404
        
        edf_files = list(SESSIONS_DIR.glob('*.edf'))
        if not edf_files:
            return jsonify({"error": "No EDF files found"}), 404
        
        edf_file = edf_files[0]
        # Read 20 seconds of data (2000 samples at 100Hz)
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
    """Stream matplotlib plots in real time; data advances at 100Hz, new plot every PLOT_UPDATE_INTERVAL."""
    import json as _json
    # Resolve EDF file and header once (outside generator) so errors return immediately
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
        from flask import Response
        return Response(
            f"data: {_json.dumps({'error': str(e)})}\n\n",
            mimetype='text/event-stream',
            headers={'Cache-Control': 'no-cache'}
        )

    def generate():
        import time
        import json
        window_samples = min(int(WINDOW_SECONDS * sfreq), 2000)
        samples_per_update = max(1, int(sfreq * PLOT_UPDATE_INTERVAL))
        sample_iter = iter_edf_samples_continuously(edf_path, channel_idx=0)
        buffer = []
        total_samples_read = 0
        update_count = 0
        printDebug(f"Plot stream: {edf_file.name} at {sfreq} Hz, plot every {PLOT_UPDATE_INTERVAL}s")
        while True:
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

    from flask import Response
    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
    })

@app.route('/api/edf/info', methods=['GET'])
def get_edf_info():
    """Get EDF file information"""
    try:
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
    
    app.run(debug=True, port=5000)
