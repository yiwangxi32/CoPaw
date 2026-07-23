$ErrorActionPreference = "Stop"

$logPath = Join-Path $PSScriptRoot "launch.log"
function Write-Log([string]$msg) {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $logPath -Value $line
}

function Test-HttpOk([string]$url) {
  try {
    $uri = [System.Uri]$url
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($uri.Host, $uri.Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(1200, $false)
    if (-not $ok) {
      $client.Close()
      return $false
    }
    $client.EndConnect($iar) | Out-Null
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Get-PidsOnPort([int]$port) {
  $pids = @()
  try {
    $tcp = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($row in $tcp) {
      if ($row.OwningProcess -and $row.OwningProcess -gt 0) {
        $pids += [int]$row.OwningProcess
      }
    }
  } catch {}
  if ($pids.Count -eq 0) {
    try {
      $lines = netstat -ano -p tcp | Select-String ":$port\s"
      foreach ($ln in $lines) {
        $parts = ($ln.ToString() -replace '\s+', ' ').Trim().Split(' ')
        if ($parts.Length -ge 5) {
          $pid = $parts[$parts.Length - 1]
          if ($pid -match '^\d+$') { $pids += [int]$pid }
        }
      }
    } catch {}
  }
  if ($pids.Count -gt 0) {
    $alive = @()
    foreach ($procId in ($pids | Select-Object -Unique)) {
      try {
        $null = Get-Process -Id $procId -ErrorAction Stop
        $alive += $procId
      } catch {
        # ignore dead processes
      }
    }
    return $alive
  }
  return @()
}

function Test-PortOpen([int]$port) {
  $p = Get-PidsOnPort $port
  return ($p.Count -gt 0)
}

function Open-CoPawUi([string]$url) {
  $edge = "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe"
  if (!(Test-Path $edge)) {
    $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  }
  if (Test-Path $edge) {
    Start-Process $edge -ArgumentList "--app=$url"
    Write-Log "Opened UI in Edge app mode"
    return
  }

  $chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
  if (!(Test-Path $chrome)) {
    $chrome = "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
  }
  if (Test-Path $chrome) {
    Start-Process $chrome -ArgumentList "--app=$url"
    Write-Log "Opened UI in Chrome app mode"
    return
  }

  Start-Process $url
  Write-Log "Opened UI in default browser"
}

try {
  Remove-Item $logPath -ErrorAction SilentlyContinue
  Write-Log "CoPaw launcher started"

  $psExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  if (!(Test-Path $psExe)) { throw "PowerShell not found: $psExe" }

  $backendDir = Join-Path $PSScriptRoot "backend"
  $webDir = Join-Path $PSScriptRoot "web"
  if (!(Test-Path $backendDir)) {
    $candidateBackend = Join-Path $PSScriptRoot "web\backend"
    if (Test-Path $candidateBackend) { $backendDir = $candidateBackend }
  }
  if (!(Test-Path $webDir) -and (Test-Path (Join-Path $PSScriptRoot "package.json"))) {
    $webDir = $PSScriptRoot
  }
  if (!(Test-Path $backendDir)) { throw "Backend directory not found: $backendDir" }
  if (!(Test-Path $webDir)) { throw "Web directory not found: $webDir" }

  if (!(Test-Path (Join-Path $backendDir ".env")) -and (Test-Path (Join-Path $backendDir ".env.example"))) {
    Copy-Item (Join-Path $backendDir ".env.example") (Join-Path $backendDir ".env")
  }
  if (!(Test-Path (Join-Path $webDir ".env")) -and (Test-Path (Join-Path $webDir ".env.example"))) {
    Copy-Item (Join-Path $webDir ".env.example") (Join-Path $webDir ".env")
  }

  if (-not (Test-HttpOk "http://127.0.0.1:8787/health")) {
    Write-Log "Starting backend process"
    Start-Process $psExe -WorkingDirectory $backendDir -WindowStyle Hidden -ArgumentList "-ExecutionPolicy", "Bypass", "-File", ".\run-dev.ps1" | Out-Null
  } else {
    Write-Log "Backend already healthy"
  }

  if (-not (Test-HttpOk "http://localhost:5173") -and -not (Test-PortOpen 5173)) {
    $webPids = Get-PidsOnPort 5173
    foreach ($procId in $webPids) {
      try {
        Stop-Process -Id $procId -Force -ErrorAction Stop
        Write-Log ("Killed stale pid on 5173: " + $procId)
      } catch {}
    }
    Write-Log "Starting web process"
    Start-Process $psExe -WorkingDirectory $webDir -WindowStyle Hidden -ArgumentList "-ExecutionPolicy", "Bypass", "-Command", "npm install; npm run dev -- --host localhost --port 5173" | Out-Null
  } else {
    Write-Log "Web already healthy/listening on 5173"
  }

  $backendOk = $false
  $webOk = $false
  for ($i = 0; $i -lt 8; $i++) {
    if (-not $backendOk) { $backendOk = Test-HttpOk "http://127.0.0.1:8787/health" }
    if (-not $webOk) { $webOk = (Test-HttpOk "http://localhost:5173") -or (Test-PortOpen 5173) }
    if ($backendOk -and $webOk) { break }
    Start-Sleep -Seconds 1
  }
  Write-Log ("Health check: backendOk=" + $backendOk + ", webOk=" + $webOk)

  if ($backendOk -and $webOk) {
    try {
      Open-CoPawUi "http://localhost:5173"
    } catch {
      Write-Log ("WARN: failed to open browser: " + $_.Exception.Message)
    }
  }
} catch {
  Write-Log ("ERROR: " + $_.Exception.Message)
  exit 1
}

