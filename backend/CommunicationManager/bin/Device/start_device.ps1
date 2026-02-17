# Emit input stream for main.exe: "start", wait for connection, then "send" + EEG data values from EDF file
# Run as: powershell -File start_device.ps1 | main.exe
# Seconds to wait after "start" before sending (time for desktop to connect)
$waitAfterStartSeconds = 15

# Paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $scriptDir))
$sessionsDir = Join-Path $backendDir "sessions"
$pythonScript = Join-Path $scriptDir "stream_edf.py"

# Check if Python is available
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCmd = "py"
}

# Find EDF files in sessions directory
$edfFiles = Get-ChildItem -Path $sessionsDir -Recurse -Filter "*.edf" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $edfFiles -or -not $pythonCmd -or -not (Test-Path $pythonScript)) {
    if (-not $edfFiles) {
        Write-Host "Warning: No EDF files found in $sessionsDir" -ForegroundColor Yellow
    }
    if (-not $pythonCmd) {
        Write-Host "Warning: Python not found in PATH" -ForegroundColor Yellow
    }
    if (-not (Test-Path $pythonScript)) {
        Write-Host "Warning: Python script not found: $pythonScript" -ForegroundColor Yellow
    }
    Write-Host "Falling back to test mode (sending incrementing integers)" -ForegroundColor Yellow
    
    Write-Output "start"
    Start-Sleep -Seconds $waitAfterStartSeconds
    for ($i = 0; $i -lt 1000; $i++) {
        Write-Output "send"
        Write-Output $i
        Start-Sleep -Seconds 1
    }
    exit
}

# Use the first EDF file found
$edfFile = $edfFiles.FullName
Write-Host "Using EDF file: $edfFile" -ForegroundColor Green

# Channel index (0 = first channel, can be modified)
$channelIdx = 0

# Sample rate multiplier (1.0 = original rate, can be adjusted for testing)
$rateMultiplier = 1.0

# Send "start" command
Write-Output "start"
Start-Sleep -Seconds $waitAfterStartSeconds

$sampleCount = 0

# Stream EDF data using Python script
try {
    # Run Python script and capture output line by line
    $pythonArgs = @(
        "`"$pythonScript`"",
        "`"$edfFile`"",
        "$channelIdx",
        "$rateMultiplier"
    )
    
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $pythonCmd
    $processInfo.Arguments = $pythonArgs -join " "
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.CreateNoWindow = $true
    # Enable unbuffered output for real-time streaming
    $processInfo.EnvironmentVariables["PYTHONUNBUFFERED"] = "1"
    
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo
    
    # Start process
    $process.Start() | Out-Null
    
    # Read output line by line and forward to main.exe
    while (-not $process.StandardOutput.EndOfStream) {
        $eegValue = $process.StandardOutput.ReadLine()
        if ($eegValue -ne $null -and $eegValue -ne "") {
            Write-Output "send"
            Write-Output $eegValue
            $sampleCount++
        }
    }
    
    # Wait for process to complete
    $process.WaitForExit()
    
    # Check for errors
    $errorOutput = $process.StandardError.ReadToEnd()
    if ($errorOutput -and $process.ExitCode -ne 0) {
        Write-Host "Python script error: $errorOutput" -ForegroundColor Red
    }
} catch {
    Write-Host "Error running Python script: $_" -ForegroundColor Red
    Write-Host "Falling back to test mode" -ForegroundColor Yellow
    
    # Fallback to incrementing integers
    for ($i = 0; $i -lt 1000; $i++) {
        Write-Output "send"
        Write-Output $i
        Start-Sleep -Seconds 1
    }
} finally {
    if ($process -and -not $process.HasExited) {
        $process.Kill()
    }
    if ($process) {
        $process.Dispose()
    }
}

Write-Host "Sent $sampleCount EEG samples" | Out-Host
