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

BACKEND_DIR: Path = Path(__file__).parent
SESSIONS_DIR: Path = BACKEND_DIR / "sessions"

WINDOW_SECONDS: int = 60
PLOT_UPDATE_INTERVAL: float = 0.1

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
    with open(edf_path, 'rb') as fh:
        fixed: bytes = fh.read(256)
    startdate: str = (fixed[168:176].decode("ascii", "ignore") or "01.01.00").strip()
    starttime: str = (fixed[176:184].decode("ascii", "ignore") or "00.00.00").strip()
    num_records: int = int(fixed[236:244].decode("ascii", "ignore").strip() or "-1")
    record_duration: float = float(fixed[244:252].decode("ascii", "ignore").strip() or "1")
    duration_sec: float = (num_records * record_duration) if num_records > 0 else 0.0
    return startdate, starttime, duration_sec

def read_edf_header(fh: BinaryIO) -> Dict[str, Any]:
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

def generate_eeg_plot(samples: np.ndarray | List[float], sfreq: float, channel_label: str, time_start_sec: float = 0.0) -> io.BytesIO:
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
    sample_count: int = 0
    start_time: float = time.time()
    for value in iter_edf_samples_continuously(str(edf_file), channel_idx=0):
        elapsed: float = time.time() - start_time
        yield f"data: {json.dumps({'value': value, 'timestamp': elapsed, 'sample': sample_count})}\n\n"
        sample_count += 1
        time.sleep(0.01)
        if elapsed > 3600: 
            break

def export_csv(samples: List[float], username: str, filename: str, sampling_rate: float) -> Tuple[str, str]:
    if not SESSIONS_DIR.exists(): 
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    import re
    ts: str = datetime.now().strftime("%Y%m%d_%H%M%S")
    base: str = re.sub(r"[^0-9a-zA-Z_-]+", "_", username or "live")
    out_name: str = filename if filename else f"{base}_session_{ts}.csv"
    out_path: Path = SESSIONS_DIR / out_name

    with open(out_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["sample_index", "time_sec", "value"])
        for idx, value in enumerate(samples):
            writer.writerow([idx, f"{idx / sampling_rate:.6f}", float(value)])
            
    return out_path.name, str(out_path)

def get_all_sessions_info() -> List[Dict[str, str]]:
    if not SESSIONS_DIR.exists(): 
        return []
    edf_files: List[Path] = sorted(SESSIONS_DIR.glob("*.edf"))
    sessions: List[Dict[str, str]] = []
    
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
            start_dt: datetime = datetime(year, month, day, hour, min_, sec)
            end_dt: datetime = datetime.fromtimestamp(start_dt.timestamp() + duration_sec)
            
            start_iso: str = start_dt.isoformat() + "Z"
            end_iso: str = end_dt.isoformat() + "Z"
            date_str: str = start_dt.strftime("%Y-%m-%d")
            hour_range: str = f"{start_dt.strftime('%I:%M %p')} – {end_dt.strftime('%I:%M %p')}"
        except Exception:
            start_iso, end_iso, date_str, hour_range = "", "", path.stem, "—"
            
        sessions.append({
            "id": path.name, "filename": path.name, "deviceId": path.stem,
            "startTime": start_iso, "endTime": end_iso,
            "date": date_str, "hourRange": hour_range,
        })
    return sessions

def get_session_data_payload(session_id: str) -> Dict[str, Any]:
    if ".." in session_id or "/" in session_id or "\\" in session_id:
        raise ValueError("Invalid session id")
    path: Path = SESSIONS_DIR / session_id
    if not path.exists() or not path.suffix.lower() == ".edf":
        raise FileNotFoundError("Session not found")
        
    with open(path, 'rb') as fh: 
        header: Dict[str, Any] = read_edf_header(fh)
    max_samples: int = min(header['num_records'] * header['samples_per_record'][0], 24 * 3600 * 512) if header['num_records'] > 0 else 500000
    
    samples_arr, sfreq, _ = read_edf_samples(str(path), channel_idx=0, max_samples=max_samples)
    step: int = max(1, int(round(sfreq)))
    samples: List[float] = [float(samples_arr[i]) for i in range(0, len(samples_arr), step)]
    
    startdate, starttime, _ = get_edf_start_and_duration(path)
    try:
        day, month, yy = [int(x) if x.strip().isdigit() else 1 for x in startdate.split(".")]
        hour, min_, sec = [int(x) if x.strip().isdigit() else 0 for x in starttime.split(".")]
        year: int = (1900 + yy) if yy >= 80 else (2000 + yy) if yy < 100 else 2000
        start_dt: datetime = dt.datetime(year, month, day, hour, min_, sec)
    except:
        start_dt = dt.datetime(2000, 1, 1, 0, 0, 0)
        
    start_ms: int = int(start_dt.timestamp() * 1000)
    timestamps_ms: List[int] = [start_ms + i * 1000 for i in range(len(samples))]
    
    duration_ms: int = len(samples) * 1000
    end_ts: int = start_ms + duration_ms
    stage_sequence: List[Dict[str, Any]] = [
        {"type": "awake", "duration": 0.1}, {"type": "light", "duration": 0.3},
        {"type": "deep", "duration": 0.25}, {"type": "light", "duration": 0.15},
        {"type": "rem", "duration": 0.2},
    ]
    stages_out: List[Dict[str, Any]] = []
    t: int = start_ms
    idx: int = 0
    while t < end_ts:
        st: Dict[str, Any] = stage_sequence[idx % len(stage_sequence)]
        stage_end: float = min(t + duration_ms * st["duration"], end_ts)
        stages_out.append({
            "type": st["type"],
            "startTime": dt.datetime.utcfromtimestamp(t / 1000).isoformat() + "Z",
            "endTime": dt.datetime.utcfromtimestamp(stage_end / 1000).isoformat() + "Z",
            "duration": (stage_end - t) / (60 * 1000),
        })
        t = int(stage_end)
        idx += 1
        
    return {
        "success": True, "id": session_id,
        "startTime": dt.datetime.utcfromtimestamp(start_ms / 1000).isoformat() + "Z",
        "endTime": dt.datetime.utcfromtimestamp(end_ts / 1000).isoformat() + "Z",
        "deviceId": path.stem, "timestamps": timestamps_ms,
        "channelData": [[s] for s in samples], "sleepStages": stages_out,
        "quality": "good", "sessionType": "night",
    }

def generate_plot_stream(live: bool, username: str, get_ble_samples_cb: Optional[Callable[[int], Tuple[List[float], int]]] = None) -> Generator[str, None, None]:
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