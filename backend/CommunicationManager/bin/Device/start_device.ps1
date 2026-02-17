# Emit input stream for main.exe: "start", wait for connection, then "send" + EEG data from EDF file every second
# Run as: powershell -File start_device.ps1 | main.exe
# Seconds to wait after "start" before sending (time for desktop to connect)
$waitAfterStartSeconds = 15

# Get the directory where this script is located
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Path to EDF file (relative to backend directory)
$backendDir = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $scriptDir))
$edfPath = Join-Path $backendDir "sessions\SC4002E0-PSG.edf"

# Path to Python script
$pythonScript = Join-Path $scriptDir "read_edf_samples.py"

# Check if Python script exists
if (-not (Test-Path $pythonScript)) {
    Write-Error "Python script not found at: $pythonScript" | Out-Host
    exit 1
}

# Check if EDF file exists
if (-not (Test-Path $edfPath)) {
    Write-Error "EDF file not found at: $edfPath" | Out-Host
    exit 1
}

Write-Output "start"
Start-Sleep -Seconds $waitAfterStartSeconds

# Start Python process to read EDF samples and capture output
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "python"
$psi.Arguments = "`"$pythonScript`" `"$edfPath`""
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true

$pythonProcess = New-Object System.Diagnostics.Process
$pythonProcess.StartInfo = $psi
$pythonProcess.Start() | Out-Null

$sampleCount = 0

try {
    # Read samples line by line from Python output
    while (-not $pythonProcess.StandardOutput.EndOfStream) {
        $sample = $pythonProcess.StandardOutput.ReadLine()
        
        if ($sample -ne $null -and $sample -ne "") {
            Write-Output "send"
            Write-Output $sample
            $sampleCount++
            
            Start-Sleep -Seconds 1
        }
    }
} catch {
    $errorMsg = $pythonProcess.StandardError.ReadToEnd()
    if ($errorMsg) {
        Write-Error "Python error: $errorMsg" | Out-Host
    }
    Write-Error "Error reading samples: $_" | Out-Host
} finally {
    if (-not $pythonProcess.HasExited) {
        $pythonProcess.Kill()
    }
    $pythonProcess.Dispose()
}

Write-Host "Sent $sampleCount EEG samples" | Out-Host
