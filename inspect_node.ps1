Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | ForEach-Object {
  "PID=$($_.ProcessId) PPID=$($_.ParentProcessId) CMD=$($_.CommandLine)"
}
