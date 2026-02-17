#!/usr/bin/env python3
"""
Read EDF file and output samples line by line for transmission.
This script reads EEG data from an EDF file and outputs samples one per line.
"""

import sys
import os
import array

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

if __name__ == "__main__":
    # Get EDF file path from command line or use default
    if len(sys.argv) > 1:
        edf_path = sys.argv[1]
    else:
        # Default path relative to script location
        script_dir = os.path.dirname(os.path.abspath(__file__))
        # Go up to backend/sessions
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(script_dir)))
        edf_path = os.path.join(backend_dir, "sessions", "SC4002E0-PSG.edf")
    
    # Channel index (default 0 for first channel)
    channel_idx = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    
    if not os.path.exists(edf_path):
        print(f"Error: EDF file not found at {edf_path}", file=sys.stderr)
        sys.exit(1)
    
    # Output samples one per line
    try:
        for sample in iter_edf_samples(edf_path, channel_idx):
            print(sample)
            sys.stdout.flush()  # Ensure immediate output
    except KeyboardInterrupt:
        sys.exit(0)
    except Exception as e:
        print(f"Error reading EDF file: {e}", file=sys.stderr)
        sys.exit(1)
