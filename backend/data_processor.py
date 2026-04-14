import array
import io
import csv
import json
import time
import base64
import datetime as dt
from datetime import datetime
from pathlib import Path
from typing import Tuple, List, Dict, Any, Generator, Optional, Callable, BinaryIO

import numpy as np
import matplotlib
matplotlib.use('Agg')  # Use non-GUI backend for server
import matplotlib.pyplot as plt

import crypto_ops
from debug import printDebug
from sleep_stages_amplitude import compute_sleep_stages_amplitude

BACKEND_DIR: Path = Path(__file__).parent
SESSIONS_DIR: Path = BACKEND_DIR / "sessions"

# Plotting/streaming parameters are tuned for interactive UX:
# - WINDOW_SECONDS controls how much signal the plot shows at a time.
# - PLOT_UPDATE_INTERVAL controls how often we regenerate the PNG in plot-stream mode.
WINDOW_SECONDS: int = 60
PLOT_UPDATE_INTERVAL: float = 0.1


# ─── EDF PARSING AND MATH ────────────────────────────────────────────────────────

def get_edf_file_for_user(username: str) -> Path:
    """Return which EDF file to use for this user (demo vs admin)."""
    u: str = (username or "").strip().lower()
    p: Optional[Path] = None
    if u == "demo":
        p = SESSIONS_DIR / "SC4001E0-PSG.edf"
    elif u == "admin":
        p = SESSIONS_DIR / "SC4002E0-PSG.edf"
    else:
        edf_files: List[Path] = list(SESSIONS_DIR.glob("*.edf"))
        p = edf_files[0] if edf_files else None
    
    if p and p.exists():
        return p
    edf_files = list(SESSIONS_DIR.glob("*.edf"))
    if edf_files:
        return edf_files[0]
    raise FileNotFoundError("No EDF files in sessions directory")

def get_edf_start_and_duration(edf_path: Path) -> Tuple[str, str, float]:
    """
    Read a few EDF fixed header fields without a full EDF parser.
    
    EDF fixed header layout (selected offsets):
    - startdate: bytes 168:176 (dd.mm.yy)
    - starttime: bytes 176:184 (hh.mm.ss)
    - num_records: bytes 236:244 (ASCII int; -1 means unknown/continuous)
    - record_duration: bytes 244:252 (ASCII float, seconds)
    """
    with open(edf_path, 'rb') as fh:
        fixed: bytes = fh.read(256)
    startdate: str = (fixed[168:176].decode("ascii", "ignore") or "01.01.00").strip()
    starttime: str = (fixed[176:184].decode("ascii", "ignore") or "00.00.00").strip()
    num_records: int = int(fixed[236:244].decode("ascii", "ignore").strip() or "-1")
    record_duration: float = float(fixed[244:252].decode("ascii", "ignore").strip() or "1")
    duration_sec: float = (num_records * record_duration) if num_records > 0 else 0.0
    return startdate, starttime, duration_sec

def read_edf_header(fh: BinaryIO) -> Dict[str, Any]:
    """
    Minimal EDF header reader.
    
    EDF stores most header fields as fixed-width ASCII strings.
    This reads enough metadata to:
    - locate a channel's samples in each record
    - compute sample frequency (samples_per_record / record_duration)
    - convert int16 digital values into physical units using linear scaling
    """
    fixed: bytes = fh.read(256)
    num_records: int = int(fixed[236:244].decode("ascii", "ignore").strip() or "-1")
    record_duration: float = float(fixed[244:252].decode("ascii", "ignore").strip() or "1")
    num_signals: int = int(fixed[252:256].decode("ascii", "ignore").strip())
    
    def read_str_list(field_len: int, count: int) -> List[str]:
        data: bytes = fh.read(field_len * count)
        return [data[i * field_len:(i + 1) * field_len].decode("ascii", "ignore").strip() 
               for i in range(count)]
    
    labels: List[str] = read_str_list(16, num_signals)
    _ = read_str_list(80, num_signals)
    _ = read_str_list(8, num_signals)
    phys_min: List[float] = [float(x or "0") for x in read_str_list(8, num_signals)]
    phys_max: List[float] = [float(x or "1") for x in read_str_list(8, num_signals)]
    dig_min: List[int] = [int(x or "-32768") for x in read_str_list(8, num_signals)]
    dig_max: List[int] = [int(x or "32767") for x in read_str_list(8, num_signals)]
    _ = read_str_list(80, num_signals)
    samples_per_record: List[int] = [int(x or "0") for x in read_str_list(8, num_signals)]
    
    return {
        'num_records': num_records, 'record_duration': record_duration,
        'num_signals': num_signals, 'labels': labels,
        'samples_per_record': samples_per_record,
        'phys_min': phys_min, 'phys_max': phys_max,
        'dig_min': dig_min, 'dig_max': dig_max
    }

def read_edf_samples(edf_path: str, channel_idx: int = 0, max_samples: int = 3000) -> Tuple[np.ndarray, float, str]:
    """
    Read up to `max_samples` samples from a single EDF channel.
    
    EDF stores data as "records". Each record contains concatenated samples for each signal:
      [ch0 samples][ch1 samples]...[chN samples]
    
    To extract one channel efficiently we:
    - compute the byte ranges before/after the channel inside each record
    - slice them away and decode the remaining int16 values
    - apply (scale, offset) to map digital int16 -> physical units
    """
    with open(edf_path, 'rb') as fh:
        header: Dict[str, Any] = read_edf_header(fh)
        
        sig_samples_per_record: int = header['samples_per_record'][channel_idx]
        total_samples_per_record: int = sum(header['samples_per_record'])
        sfreq: float = sig_samples_per_record / header['record_duration']
        
        scale: float = (header['phys_max'][channel_idx] - header['phys_min'][channel_idx]) / (header['dig_max'][channel_idx] - header['dig_min'][channel_idx])
        offset: float = header['phys_min'][channel_idx] - scale * header['dig_min'][channel_idx]
        
        bytes_per_record: int = total_samples_per_record * 2
        bytes_before: int = sum(header['samples_per_record'][:channel_idx]) * 2
        bytes_after: int = bytes_per_record - bytes_before - sig_samples_per_record * 2
        
        samples: List[float] = []
        record_idx: int = 0
        
        while len(samples) < max_samples:
            if header['num_records'] != -1 and record_idx >= header['num_records']: 
                break
            block: bytes = fh.read(bytes_per_record)
            if len(block) < bytes_per_record: 
                break
                
            if bytes_before: block = block[bytes_before:]
            if bytes_after: block = block[:-bytes_after]
                
            data: array.array = array.array("h")
            data.frombytes(block)
            
            for value in data:
                if len(samples) >= max_samples: break
                samples.append(float(scale * value + offset))
            record_idx += 1
        
        return np.array(samples), sfreq, header['labels'][channel_idx]

def iter_edf_samples_continuously(edf_path: str, channel_idx: int = 0) -> Generator[float, None, None]:
    """
    Generator that yields channel samples sequentially until EOF.
    
    Used by streaming endpoints to simulate realtime replay of EDF recordings.
    """
    with open(edf_path, 'rb') as fh:
        header: Dict[str, Any] = read_edf_header(fh)
        sig_samples_per_record: int = header['samples_per_record'][channel_idx]
        total_samples_per_record: int = sum(header['samples_per_record'])
        scale: float = (header['phys_max'][channel_idx] - header['phys_min'][channel_idx]) / (header['dig_max'][channel_idx] - header['dig_min'][channel_idx])
        offset: float = header['phys_min'][channel_idx] - scale * header['dig_min'][channel_idx]
        
        bytes_per_record: int = total_samples_per_record * 2
        bytes_before: int = sum(header['samples_per_record'][:channel_idx]) * 2
        bytes_after: int = bytes_per_record - bytes_before - sig_samples_per_record * 2
        record_idx: int = 0
        
        while True:
            if header['num_records'] != -1 and record_idx >= header['num_records']: 
                break
            block: bytes = fh.read(bytes_per_record)
            if len(block) < bytes_per_record: 
                break
            if bytes_before: block = block[bytes_before:]
            if bytes_after: block = block[:-bytes_after]
                
            data: array.array = array.array("h")
            data.frombytes(block)
            for value in data:
                yield float(scale * value + offset)
            record_idx += 1


# ─── PLOTTING AND STREAMING ──────────────────────────────────────────────────────

def generate_eeg_plot(samples: np.ndarray | List[float], sfreq: float, channel_label: str, time_start_sec: float = 0.0) -> io.BytesIO:
    """
    Render a 2-panel PNG:
    - top: time-domain window of the signal
    - bottom: simple FFT-based power spectrum (band-shaded)
    
    Returned as an in-memory PNG so Flask can `send_file` without writing to disk.
    """
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8))
    fig.suptitle(f'EEG Analysis - {channel_label}', fontsize=14, fontweight='bold')
    
    display_samples: int = min(int(WINDOW_SECONDS * sfreq), len(samples))
    time_axis: np.ndarray = time_start_sec + np.arange(display_samples) / sfreq
    ax1.plot(time_axis, samples[:display_samples], 'b-', linewidth=0.5)
    ax1.set_xlabel('Time (seconds into recording)')
    ax1.set_ylabel('Amplitude (µV)')
    time_end: float = time_start_sec + display_samples / sfreq
    ax1.set_title(f'EEG Signal ({WINDOW_SECONDS}s window) — {time_start_sec:.1f}s to {time_end:.1f}s')
    ax1.grid(True, alpha=0.3)
    ax1.set_xticks(np.linspace(time_start_sec, time_end, 5))
    ax1.set_xlim(time_start_sec, time_end)
    ax1.tick_params(axis='x', which='major', labelsize=9)
    
    if len(samples) > 100:
        # Windowing reduces FFT spectral leakage; spectrum is used only for visualization.
        window: np.ndarray = np.hanning(len(samples))
        windowed: np.ndarray = np.array(samples) * window
        freqs: np.ndarray = np.fft.rfftfreq(len(windowed), d=1.0/sfreq)
        spectrum: np.ndarray = np.abs(np.fft.rfft(windowed)) ** 2
        ax2.semilogy(freqs, spectrum, 'k-', linewidth=1, alpha=0.7)
        bands: List[Tuple[float, float, str, Tuple[float, float, float]]] = [
            (0.5, 4.0, 'Delta', (0.2, 0.4, 0.8)),
            (4.0, 8.0, 'Theta', (0.4, 0.6, 0.9)),
            (8.0, 13.0, 'Alpha', (0.9, 0.5, 0.1)),
            (13.0, 30.0, 'Beta', (0.8, 0.2, 0.2))
        ]
        for low, high, name, color in bands:
            mask: np.ndarray = (freqs >= low) & (freqs <= high)
            if np.any(mask):
                ax2.fill_between(freqs[mask], 1, spectrum[mask], alpha=0.3, color=color, label=name)
        
        ax2.set_xlabel('Frequency (Hz)')
        ax2.set_ylabel('Power')
        ax2.set_title('Power Spectrum')
        ax2.set_xlim(0, 35)
        ax2.legend()
        ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    buf: io.BytesIO = io.BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    buf.seek(0)
    plt.close(fig)
    return buf

def stream_edf_data(edf_file: Path) -> Generator[str, None, None]:
    """SSE generator replaying EDF samples at ~100Hz-ish (sleep(0.01))."""
    sample_count: int = 0
    start_time: float = time.time()
    for value in iter_edf_samples_continuously(str(edf_file), channel_idx=0):
        elapsed: float = time.time() - start_time
        yield f"data: {json.dumps({'value': value, 'timestamp': elapsed, 'sample': sample_count})}\n\n"
        sample_count += 1
        time.sleep(0.01)
        if elapsed > 3600: 
            break

def generate_plot_stream(live: bool, username: str, get_ble_samples_cb: Optional[Callable[[int], Tuple[List[float], int]]] = None) -> Generator[str, None, None]:
    """
    SSE generator that periodically sends a base64-encoded PNG.
    
    Two modes:
    - live=True: plot the newest BLE samples pulled via `get_ble_samples_cb`
    - live=False: replay samples from the chosen EDF file and plot them
    
    Implementation notes:
    - `buffer` is a sliding window to keep plots responsive.
    - `total_samples_read` is used to compute the x-axis time offset so the plot
      aligns with the position in the full session.
    """
    if live:
        channel_label: str = "BLE"
        sfreq: float = 100.0
        edf_path: Optional[str] = None
    else:
        edf_file: Path = get_edf_file_for_user(username)
        with open(str(edf_file), 'rb') as fh: 
            header: Dict[str, Any] = read_edf_header(fh)
        channel_label = header['labels'][0]
        sfreq = header['samples_per_record'][0] / header['record_duration']
        edf_path = str(edf_file)

    window_samples: int = min(int(WINDOW_SECONDS * sfreq), 8000)
    samples_per_update: int = max(1, int(sfreq * PLOT_UPDATE_INTERVAL))
    buffer: List[float] = []
    total_samples_read: int = 0
    update_count: int = 0
    last_len: int = 0
    
    sample_iter: Optional[Generator[float, None, None]] = None
    if not live and edf_path: 
        sample_iter = iter_edf_samples_continuously(edf_path, channel_idx=0)

    while True:
        if live and get_ble_samples_cb:
            new_part, last_len = get_ble_samples_cb(last_len)
            for v in new_part:
                buffer.append(v)
                total_samples_read += 1
            if len(buffer) > window_samples: 
                buffer = buffer[-window_samples:]
        elif sample_iter is not None:
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
        
        time_start_sec: float = max(0, (total_samples_read - len(buffer)) / sfreq)
        try:
            img_buffer: io.BytesIO = generate_eeg_plot(np.array(buffer, dtype=float), sfreq, channel_label, time_start_sec)
            img_buffer.seek(0)
            b64: str = base64.b64encode(img_buffer.read()).decode('utf-8')
            yield f"data: {json.dumps({'image': f'data:image/png;base64,{b64}', 'samples': len(buffer)})}\n\n"
            update_count += 1
        except Exception as e:
            yield f"data: {json.dumps({'error': f'Plot gen: {e}'})}\n\n"
        time.sleep(PLOT_UPDATE_INTERVAL)
        if update_count > 36000: 
            break


# ─── SECURE SAVING AND LOADING (ENCRYPTED .EEG) ──────────────────────────────────

def save_eeg(samples: List[float], username: str, sampling_rate: float = 100.0) -> str:
    """Packages live EEG samples and encrypts them using crypto_ops."""
    ts: str = datetime.now().strftime("%Y%m%d_%H%M%S")
    session_data: Dict[str, Any] = {
        "username": username,
        "Time": ts,  # Used for the filename
        "sampling_rate": sampling_rate,
        "samples": samples
    }
    
    # `crypto_ops.encrypt_session` requires that a user successfully authenticated first,
    # because the encryption key is derived and stored globally as `crypto_ops.USR_KEY`.
    success: bool = crypto_ops.encrypt_session(session_data)
    if not success:
        raise RuntimeError("Encryption failed during save_eeg. User may not be logged in.")
        
    return f"{ts}.eeg"

def load_eeg(filename: str) -> Dict[str, Any]:
    """Loads and decrypts an .eeg file through crypto_ops."""
    return crypto_ops.decrypt_session(filename)

def export_csv(samples: List[float], username: str, filename: str, sampling_rate: float, output_dir: str = "") -> Tuple[str, str]:
    """Write raw samples to CSV for external analysis (not encrypted)."""
    target_dir: Path
    if output_dir and str(output_dir).strip():
        target_dir = Path(str(output_dir).strip()).expanduser()
        if not target_dir.is_absolute():
            target_dir = (BACKEND_DIR.parent / target_dir).resolve()
    else:
        target_dir = SESSIONS_DIR

    if not target_dir.exists():
        target_dir.mkdir(parents=True, exist_ok=True)
    import re
    ts: str = datetime.now().strftime("%Y%m%d_%H%M%S")
    base: str = re.sub(r"[^0-9a-zA-Z_-]+", "_", username or "live")
    out_name: str = filename if filename else f"{base}_session_{ts}.csv"
    out_path: Path = target_dir / out_name

    with open(out_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["sample_index", "time_sec", "value"])
        for idx, value in enumerate(samples):
            writer.writerow([idx, f"{idx / sampling_rate:.6f}", float(value)])
            
    return out_path.name, str(out_path)


# ─── FRONTEND DATA PAYLOAD GENERATION (HYBRID SUPPORT) ───────────────────────────

def get_all_sessions_info() -> List[Dict[str, str]]:
    """
    Fetches the list of valid encrypted sessions for the logged-in user,
    decrypts their metadata, and formats it for the frontend list.
    (Falls back to reading .edf files if you want to keep the demo files visible).
    """
    if not SESSIONS_DIR.exists(): 
        return []
    
    sessions: List[Dict[str, str]] = []

    # 1. Fetch User's Encrypted .eeg Sessions
    valid_eeg_files: List[str] = crypto_ops.list_user_sessions()
    
    for filename in valid_eeg_files:
        try:
            # Decrypt just to get the metadata
            session_data: Dict[str, Any] = crypto_ops.decrypt_session(filename)
            
            ts_str: str = session_data.get("Time", "")
            samples: List[float] = session_data.get("samples", [])
            sampling_rate: float = session_data.get("sampling_rate", 100.0)
            
            # Parse the timestamp (Format used in save_eeg: "%Y%m%d_%H%M%S")
            try:
                start_dt: datetime = datetime.strptime(ts_str, "%Y%m%d_%H%M%S")
            except ValueError:
                start_dt = datetime.now()
            
            duration_sec: float = len(samples) / sampling_rate if sampling_rate > 0 else 0.0
            end_dt: datetime = start_dt + dt.timedelta(seconds=duration_sec)
            
            sessions.append({
                "id": filename, 
                "filename": filename, 
                "deviceId": Path(filename).stem,
                "startTime": start_dt.isoformat() + "Z", 
                "endTime": end_dt.isoformat() + "Z",
                "date": start_dt.strftime("%Y-%m-%d"), 
                "hourRange": f"{start_dt.strftime('%I:%M %p')} – {end_dt.strftime('%I:%M %p')}",
            })
        except Exception as e:
            printDebug(f"Error processing encrypted session {filename}: {e}")

    # 2. Fetch standard .edf Demo Files (Optional fallback)
    edf_files: List[Path] = sorted(SESSIONS_DIR.glob("*.edf"))
    for path in edf_files:
        try:
            startdate, starttime, duration_sec = get_edf_start_and_duration(path)
            parts_d: List[str] = startdate.split(".")
            parts_t: List[str] = starttime.split(".")
            day: int = int(parts_d[0]) if len(parts_d) >= 1 and parts_d[0].strip().isdigit() else 1
            month: int = int(parts_d[1]) if len(parts_d) >= 2 and parts_d[1].strip().isdigit() else 1
            yy: int = int(parts_d[2]) if len(parts_d) >= 3 and parts_d[2].strip().isdigit() else 0
            year: int = (1900 + yy) if yy >= 80 else (2000 + yy) if yy < 100 else 2000
            hour: int = int(parts_t[0]) if len(parts_t) >= 1 and parts_t[0].strip().isdigit() else 0
            min_: int = int(parts_t[1]) if len(parts_t) >= 2 and parts_t[1].strip().isdigit() else 0
            sec: int = int(parts_t[2]) if len(parts_t) >= 3 and parts_t[2].strip().isdigit() else 0
            start_dt = datetime(year, month, day, hour, min_, sec)
            end_dt = datetime.fromtimestamp(start_dt.timestamp() + duration_sec)
            
            sessions.append({
                "id": path.name, "filename": path.name, "deviceId": path.stem,
                "startTime": start_dt.isoformat() + "Z", 
                "endTime": end_dt.isoformat() + "Z",
                "date": start_dt.strftime("%Y-%m-%d"), 
                "hourRange": f"{start_dt.strftime('%I:%M %p')} – {end_dt.strftime('%I:%M %p')}",
            })
        except Exception:
            pass

    return sessions

def get_session_data_payload(session_id: str) -> Dict[str, Any]:
    """
    Loads a specific session's actual EEG samples.
    Dynamically handles BOTH encrypted .eeg files and raw demo .edf files.
    """
    if ".." in session_id or "/" in session_id or "\\" in session_id:
        raise ValueError("Invalid session id")
    
    path: Path = SESSIONS_DIR / session_id
    if not path.exists():
        raise FileNotFoundError("Session not found")

    samples: List[float] = []
    start_dt: datetime = datetime.now()
    sfreq: float = 100.0
    raw_for_stages: Optional[np.ndarray] = None
    
    # --- HANDLE ENCRYPTED .EEG FILES ---
    if path.suffix.lower() == ".eeg":
        session_data: Dict[str, Any] = crypto_ops.decrypt_session(session_id)
        raw_samples: List[float] = session_data.get("samples", [])
        sfreq = float(session_data.get("sampling_rate", 100.0))
        ts_str: str = session_data.get("Time", "")
        
        try:
            start_dt = datetime.strptime(ts_str, "%Y%m%d_%H%M%S")
        except ValueError:
            start_dt = datetime.now()
            
        if raw_samples:
            raw_for_stages = np.asarray(raw_samples, dtype=np.float64)
        # Downsample to ~1Hz for review mode performance.
        # The UI only needs a coarse trend line for long sessions; the full-rate samples
        # remain in the encrypted file and can be exported separately if needed.
        step: int = max(1, int(round(sfreq)))
        samples = [float(raw_samples[i]) for i in range(0, len(raw_samples), step)]

    # --- HANDLE RAW DEMO .EDF FILES ---
    elif path.suffix.lower() == ".edf":
        with open(path, 'rb') as fh: 
            header: Dict[str, Any] = read_edf_header(fh)
        max_samples: int = min(header['num_records'] * header['samples_per_record'][0], 24 * 3600 * 512) if header['num_records'] > 0 else 500000
        
        samples_arr, sfreq, _ = read_edf_samples(str(path), channel_idx=0, max_samples=max_samples)
        raw_for_stages = np.asarray(samples_arr, dtype=np.float64)
        step = max(1, int(round(sfreq)))
        samples = [float(samples_arr[i]) for i in range(0, len(samples_arr), step)]
        
        startdate, starttime, _ = get_edf_start_and_duration(path)
        try:
            day, month, yy = [int(x) if x.strip().isdigit() else 1 for x in startdate.split(".")]
            hour, min_, sec = [int(x) if x.strip().isdigit() else 0 for x in starttime.split(".")]
            year: int = (1900 + yy) if yy >= 80 else (2000 + yy) if yy < 100 else 2000
            start_dt = dt.datetime(year, month, day, hour, min_, sec)
        except:
            start_dt = dt.datetime(2000, 1, 1, 0, 0, 0)
    else:
        raise ValueError("Unsupported file format.")

    # --- COMMON PAYLOAD BUILDER ---
    start_ms: int = int(start_dt.timestamp() * 1000)
    timestamps_ms: List[int] = [start_ms + i * 1000 for i in range(len(samples))]
    
    duration_ms: int = len(samples) * 1000
    end_ts: int = start_ms + duration_ms
    if raw_for_stages is not None and raw_for_stages.size >= 2:
        # Sleep stages are computed from the *raw* (non-downsampled) signal to preserve
        # the amplitude dynamics the stage classifier expects.
        stages_out = compute_sleep_stages_amplitude(raw_for_stages, sfreq, start_ms, session_end_ms=end_ts)
    else:
        stages_out = []
        
    return {
        "success": True, 
        "id": session_id,
        "startTime": dt.datetime.utcfromtimestamp(start_ms / 1000).isoformat() + "Z",
        "endTime": dt.datetime.utcfromtimestamp(end_ts / 1000).isoformat() + "Z",
        "deviceId": path.stem, 
        "timestamps": timestamps_ms,
        "channelData": [[s] for s in samples], 
        "sleepStages": stages_out,
        "quality": "good", 
        "sessionType": "night",
    }