# Emit input stream for main.exe: "start", wait for connection, then "send" + incrementing integer every second
# Run as: powershell -File start_device.ps1 | main.exe
# Seconds to wait after "start" before sending (time for desktop to connect)
$waitAfterStartSeconds = 15

Write-Output "start"
Start-Sleep -Seconds $waitAfterStartSeconds
for ($i = 0; $i -lt 1000; $i++) {
    Write-Output "send"
    Write-Output $i
    Start-Sleep -Seconds 1
}
