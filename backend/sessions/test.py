import mne
import yasa
import pandas as pd
import matplotlib.pyplot as plt
from scipy.ndimage import median_filter

def smooth_predictions(hypno_str, window_size=5):
    """
    Smooths the sleep stages using a median filter to remove short glitches.
    window_size=5 means we look at ~2.5 minutes of context.
    """
    # 1. Map string stages to integers for filtering
    mapping = {'W': 0, 'N1': 1, 'N2': 2, 'N3': 3, 'R': 4}
    inv_mapping = {v: k for k, v in mapping.items()}
    
    # Convert strings to numbers, filling NaNs with 0 (Wake)
    hypno_int = pd.Series(hypno_str).map(mapping).fillna(0).astype(int).values
    
    # 2. Apply Median Filter (removes outliers)
    hypno_smooth_int = median_filter(hypno_int, size=window_size, mode='nearest')
    
    # 3. Convert back to strings
    hypno_smooth_str = [inv_mapping[x] for x in hypno_smooth_int]
    return hypno_smooth_str

if __name__ == "__main__":
    # 1. Load Data
    print("Loading EEG data...")
    file_path = 'SC4001E0-PSG.edf'
    raw = mne.io.read_raw_edf(file_path, preload=True, verbose=False)
    
    # Filter 0.1 - 40 Hz
    raw.filter(0.1, 40, verbose=False)

    # 2. Predict Stages (Raw Data)
    print("Running AI sleep staging...")
    sls = yasa.SleepStaging(
        raw, 
        eeg_name='EEG Fpz-Cz',
        eog_name='EOG horizontal',
        emg_name='EMG submental'
    )
    predictions_raw = sls.predict()
    
    # 3. Create Smoothed Version
    print("Calculating smoothed version...")
    # You can increase window_size (e.g., 9 or 11) for even smoother results
    predictions_smooth = smooth_predictions(predictions_raw, window_size=7)

    # 4. Visualize
    # We wrap the smoothed list in a YASA Hypnogram object to handle data types correctly
    hyp = yasa.Hypnogram(predictions_smooth)
    
    hyp.plot_hypnogram()
    
    plt.title("Predicted Sleep Architecture (Smoothed)")
    plt.tight_layout()
    plt.show()
    
    # Optional: Print stats for the smoothed version
    print("\nStats for smoothed data:")
    print(hyp.sleep_statistics())