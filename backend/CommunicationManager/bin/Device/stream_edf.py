#!/usr/bin/env python3
"""
Helper script to stream EDF file data for Bluetooth transmission.
Reads EDF file and outputs EEG values one per line at the appropriate sample rate.
"""
import sys
import array
import time
from pathlib import Path

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

def iter_edf_samples(edf_path, channel_idx=0):
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
                yield float(scale * value + offset), sfreq
                
            record_idx += 1

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: stream_edf.py <edf_file_path> [channel_idx] [sample_rate_multiplier]", file=sys.stderr)
        sys.exit(1)
    
    edf_path = Path(sys.argv[1])
    channel_idx = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    rate_multiplier = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    
    if not edf_path.exists():
        print(f"Error: EDF file not found: {edf_path}", file=sys.stderr)
        sys.exit(1)
    
    try:
        sample_count = 0
        last_sfreq = None
        
        for value, sfreq in iter_edf_samples(edf_path, channel_idx):
            if last_sfreq is None:
                last_sfreq = sfreq
                # Calculate sleep time based on sample rate
                sleep_time = 1.0 / (sfreq * rate_multiplier)
            
            # Output the EEG value (unbuffered for real-time streaming)
            print(f"{value:.6f}", flush=True)
            
            # Sleep to maintain proper sample rate
            if sleep_time > 0:
                time.sleep(sleep_time)
            
            sample_count += 1
            
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"Error reading EDF file: {e}", file=sys.stderr)
        sys.exit(1)
