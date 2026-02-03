# realtime_eeg_plotter.py
import argparse
import array
import time
import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.collections import LineCollection


@dataclass
class EdfSignalInfo:
    label: str
    samples_per_record: int
    phys_min: float
    phys_max: float
    dig_min: int
    dig_max: int

    @property
    def scale(self) -> float:
        return (self.phys_max - self.phys_min) / (self.dig_max - self.dig_min)

    @property
    def offset(self) -> float:
        return self.phys_min - self.scale * self.dig_min


@dataclass
class EdfHeader:
    record_duration: float
    num_records: int
    signals: list[EdfSignalInfo]


def _read_str_list(fh, field_len: int, count: int) -> list[str]:
    data = fh.read(field_len * count)
    return [
        data[i * field_len : (i + 1) * field_len].decode("ascii", "ignore").strip()
        for i in range(count)
    ]


def read_edf_header(fh) -> EdfHeader:
    fixed = fh.read(256)
    if len(fixed) < 256:
        raise ValueError("Not a valid EDF file (header too short).")

    num_records = int(fixed[236:244].decode("ascii", "ignore").strip() or "-1")
    record_duration = float(
        fixed[244:252].decode("ascii", "ignore").strip() or "1"
    )
    num_signals = int(fixed[252:256].decode("ascii", "ignore").strip())

    labels = _read_str_list(fh, 16, num_signals)
    _ = _read_str_list(fh, 80, num_signals)  # transducer
    _ = _read_str_list(fh, 8, num_signals)  # physical dimension
    phys_min = [float(x or "0") for x in _read_str_list(fh, 8, num_signals)]
    phys_max = [float(x or "1") for x in _read_str_list(fh, 8, num_signals)]
    dig_min = [int(x or "-32768") for x in _read_str_list(fh, 8, num_signals)]
    dig_max = [int(x or "32767") for x in _read_str_list(fh, 8, num_signals)]
    _ = _read_str_list(fh, 80, num_signals)  # prefiltering
    samples_per_record = [int(x or "0") for x in _read_str_list(fh, 8, num_signals)]
    _ = _read_str_list(fh, 32, num_signals)  # reserved

    signals = [
        EdfSignalInfo(
            label=labels[i],
            samples_per_record=samples_per_record[i],
            phys_min=phys_min[i],
            phys_max=phys_max[i],
            dig_min=dig_min[i],
            dig_max=dig_max[i],
        )
        for i in range(num_signals)
    ]

    return EdfHeader(
        record_duration=record_duration,
        num_records=num_records,
        signals=signals,
    )


def iter_channel_samples(path: str, channel_label: str | None = None):
    with open(path, "rb") as fh:
        header = read_edf_header(fh)

        if channel_label:
            labels = [s.label for s in header.signals]
            if channel_label not in labels:
                raise ValueError(
                    f"Channel '{channel_label}' not found. Available: {labels}"
                )
            ch_idx = labels.index(channel_label)
        else:
            ch_idx = 0

        sig = header.signals[ch_idx]
        samples_per_record = sig.samples_per_record
        total_samples_per_record = sum(s.samples_per_record for s in header.signals)

        bytes_per_record = total_samples_per_record * 2
        bytes_before = sum(s.samples_per_record for s in header.signals[:ch_idx]) * 2
        bytes_after = bytes_per_record - bytes_before - samples_per_record * 2

        record_idx = 0
        while True:
            if header.num_records != -1 and record_idx >= header.num_records:
                break

            block = fh.read(bytes_per_record)
            if len(block) < bytes_per_record:
                break

            if bytes_before:
                block = block[bytes_before:]
            if bytes_after:
                block = block[: -bytes_after]

            data = array.array("h")
            data.frombytes(block)

            for value in data:
                yield sig.scale * value + sig.offset

            record_idx += 1


def band_powers(samples: np.ndarray, sfreq: float) -> dict[str, float]:
    if samples.size == 0:
        return {"delta": 0.0, "theta": 0.0, "alpha": 0.0, "beta": 0.0}

    x = samples - np.mean(samples)
    window = np.hanning(len(x))
    xw = x * window
    freqs = np.fft.rfftfreq(len(xw), d=1.0 / sfreq)
    psd = np.abs(np.fft.rfft(xw)) ** 2

    def _band(low: float, high: float) -> float:
        idx = (freqs >= low) & (freqs < high)
        return float(np.sum(psd[idx]))

    return {
        "delta": _band(0.5, 4.0),
        "theta": _band(4.0, 8.0),
        "alpha": _band(8.0, 13.0),
        "beta": _band(13.0, 30.0),
    }


def estimate_stage(powers: dict[str, float]) -> str:
    total = sum(powers.values()) or 1.0
    rel = {k: v / total for k, v in powers.items()}

    if rel["delta"] > 0.50:
        return "N3"
    if rel["alpha"] > 0.30:
        return "Awake"
    if rel["theta"] > 0.35 and rel["beta"] > 0.20:
        return "REM"
    if rel["delta"] > 0.30:
        return "N2"
    return "N1"


def stage_to_color(stage: str) -> tuple[float, float, float]:
    """Map stage label to RGB color."""
    if "N3" in stage:
        return (0.0, 0.0, 0.8)  # dark blue - deep sleep
    if "N2" in stage:
        return (0.0, 0.6, 0.9)  # light blue
    if "REM" in stage:
        return (0.9, 0.1, 0.1)  # red
    if "Awake" in stage:
        return (0.0, 0.8, 0.0)  # green
    return (1.0, 0.8, 0.0)  # yellow - N1/light sleep


class EEGGraphGenerator:
    def __init__(self, edf_path: str, output_dir: str = "eeg_graphs"):
        self.edf_path = edf_path
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        with open(edf_path, "rb") as fh:
            self.header = read_edf_header(fh)
        
        self.session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.session_dir = self.output_dir / self.session_id
        self.session_dir.mkdir(exist_ok=True)
        
        self.metadata = {
            "session_id": self.session_id,
            "edf_file": Path(edf_path).name,
            "created_at": datetime.now().isoformat(),
            "signals": [asdict(sig) for sig in self.header.signals],
            "num_records": self.header.num_records,
            "record_duration": self.header.record_duration
        }
    
    def generate_graphs(self, update_interval: float = 5.0, total_duration: float = 300.0):
        """Generate graphs for all channels with specified interval."""
        channels = [sig.label for sig in self.header.signals]
        graphs_data = []
        
        for channel in channels:
            channel_graphs = self._generate_channel_graphs(channel, update_interval, total_duration)
            graphs_data.extend(channel_graphs)
        
        # Save metadata
        metadata_file = self.session_dir / "metadata.json"
        with open(metadata_file, 'w') as f:
            json.dump(self.metadata, f, indent=2)
        
        return graphs_data
    
    def _generate_channel_graphs(self, channel: str, update_interval: float, total_duration: float):
        """Generate time-series graphs for a specific channel."""
        sig = self.header.signals[[s.label for s in self.header.signals].index(channel)]
        sfreq = sig.samples_per_record / self.header.record_duration
        
        display_sec = 30.0  # Show 30 seconds in each graph
        window_sec = 30.0   # Use 30 seconds for FFT
        
        display_len = int(display_sec * sfreq)
        window_len = int(window_sec * sfreq)
        step_len = int(update_interval * sfreq)
        
        sample_iter = iter_channel_samples(self.edf_path, channel)
        
        buffer = np.zeros(display_len, dtype=float)
        history = np.zeros(window_len, dtype=float)
        buffer_idx = 0
        history_idx = 0
        sample_idx = 0
        
        graphs_data = []
        start_time = datetime.now()
        
        while (datetime.now() - start_time).total_seconds() < total_duration:
            # Collect samples
            samples = []
            for _ in range(step_len):
                try:
                    samples.append(next(sample_iter))
                except StopIteration:
                    # End of file
                    return graphs_data
            
            # Update buffers
            for value in samples:
                buffer[buffer_idx % display_len] = value
                buffer_idx += 1
                history[history_idx % window_len] = value
                history_idx += 1
                sample_idx += 1
            
            # Prepare data for display
            if buffer_idx < display_len:
                current_signal = np.roll(buffer, -buffer_idx)
            else:
                current_signal = np.roll(buffer, -(buffer_idx % display_len))
            
            if history_idx < window_len:
                window_data = np.roll(history, -history_idx)
            else:
                window_data = np.roll(history, -(history_idx % window_len))
            
            # Calculate band powers
            powers = band_powers(window_data, sfreq)
            stage = estimate_stage(powers)
            
            # Create figure with signal and power spectrum
            fig, (ax_signal, ax_power) = plt.subplots(2, 1, figsize=(12, 8))
            fig.suptitle(f"EEG Channel: {channel} | Stage: {stage}", fontsize=14)
            
            # Plot signal
            time_axis = np.linspace(0, display_sec, display_len)
            signal_color = stage_to_color(stage)
            ax_signal.plot(time_axis, current_signal, color=signal_color, linewidth=1.5)
            ax_signal.set_xlabel("Time (seconds)")
            ax_signal.set_ylabel("Amplitude (µV)")
            ax_signal.grid(True, alpha=0.3)
            ax_signal.set_title("EEG Signal (30-second window)")
            
            # Plot power spectrum
            frequencies = np.fft.rfftfreq(window_len, d=1.0/sfreq)
            spectrum = np.abs(np.fft.rfft(window_data - np.mean(window_data))) ** 2
            
            band_colors = {
                "delta": (0.2, 0.4, 0.8),
                "theta": (0.4, 0.6, 0.9),
                "alpha": (0.9, 0.5, 0.1),
                "beta": (0.8, 0.2, 0.2)
            }
            
            ax_power.plot(frequencies, spectrum, color='black', alpha=0.7, linewidth=1)
            
            # Add colored bands
            band_ranges = [(0.5, 4.0), (4.0, 8.0), (8.0, 13.0), (13.0, 30.0)]
            band_names = ["delta", "theta", "alpha", "beta"]
            
            for (low, high), name in zip(band_ranges, band_names):
                mask = (frequencies >= low) & (frequencies <= high)
                ax_power.fill_between(frequencies[mask], 0, spectrum[mask], 
                                     alpha=0.4, color=band_colors[name], label=name)
            
            ax_power.set_xlabel("Frequency (Hz)")
            ax_power.set_ylabel("Power")
            ax_power.set_title("Power Spectrum")
            ax_power.legend()
            ax_power.grid(True, alpha=0.3)
            ax_power.set_xlim(0, 35)
            
            # Add info text
            info_text = f"Sampling Rate: {sfreq:.1f} Hz\n"
            info_text += f"Time: {sample_idx/sfreq:.1f}s\n"
            info_text += f"Stage: {stage}"
            fig.text(0.02, 0.02, info_text, fontsize=10, 
                    bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.8))
            
            plt.tight_layout()
            
            # Save the graph
            timestamp = int(time.time() * 1000)
            filename = f"{channel.replace(' ', '_').replace('/', '_')}_{timestamp}.png"
            filepath = self.session_dir / filename
            
            plt.savefig(filepath, dpi=100, bbox_inches='tight')
            plt.close(fig)
            
            # Add to graphs data
            graphs_data.append({
                "channel": channel,
                "timestamp": timestamp,
                "filename": filename,
                "stage": stage,
                "band_powers": powers,
                "elapsed_time": sample_idx / sfreq,
                "sampling_rate": sfreq
            })
            
            # Sleep to maintain real-time feel (optional)
            time.sleep(update_interval)
        
        return graphs_data


def main():
    parser = argparse.ArgumentParser(
        description="Generate EEG graphs from EDF file for web display."
    )
    parser.add_argument("edf_path", help="Path to EDF file")
    parser.add_argument(
        "--output-dir",
        default="eeg_graphs",
        help="Directory to save generated graphs (default: eeg_graphs)"
    )
    parser.add_argument(
        "--update-interval",
        type=float,
        default=5.0,
        help="Seconds between graph updates (default: 5)"
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=300.0,
        help="Total duration to process in seconds (default: 300)"
    )
    
    args = parser.parse_args()
    
    print(f"Starting EEG graph generation for {args.edf_path}")
    print(f"Output directory: {args.output_dir}")
    print(f"Update interval: {args.update_interval}s")
    print(f"Total duration: {args.duration}s")
    
    generator = EEGGraphGenerator(args.edf_path, args.output_dir)
    graphs = generator.generate_graphs(args.update_interval, args.duration)
    
    print(f"Generated {len(graphs)} graphs")
    print(f"Graphs saved in: {generator.session_dir}")
    
    # Create index file for web display
    index_data = {
        "session_id": generator.session_id,
        "num_graphs": len(graphs),
        "channels": list(set(g["channel"] for g in graphs)),
        "graphs": graphs
    }
    
    index_file = generator.output_dir / f"{generator.session_id}_index.json"
    with open(index_file, 'w') as f:
        json.dump(index_data, f, indent=2)
    
    print(f"Index file created: {index_file}")


if __name__ == "__main__":
    main()