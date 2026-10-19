// Pure module: the PowerShell reporter source, the statusLine command, and settings.json install/remove.
// Works in browsers and Node (no Buffer). The PowerShell text below must contain no backticks or "${".

export const REPORTER_PS1 = String.raw`$ErrorActionPreference = 'Stop'
$acct = $null
$out = $null
try {
  try { [Console]::InputEncoding = [System.Text.Encoding]::UTF8 } catch { }
  try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
  $raw = [Console]::In.ReadToEnd()
  $obj = $raw | ConvertFrom-Json
  $sep = [string][System.IO.Path]::DirectorySeparatorChar
  $tp = ([string]$obj.transcript_path).Replace('\', $sep).Replace('/', $sep)
  $p = $tp
  for ($i = 0; $i -lt 3; $i++) { $p = Split-Path -Parent $p }
  if (-not $p) { throw 'transcript_path is too short to find the account folder' }
  $acct = $p
  $routerDir = Join-Path $acct 'router'
  $statusDir = Join-Path $routerDir 'status'
  if (-not (Test-Path -LiteralPath $statusDir)) { New-Item -ItemType Directory -Force -Path $statusDir | Out-Null }
  $ms = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
  $obj | Add-Member -NotePropertyName savedAtMs -NotePropertyValue $ms -Force
  $json = $obj | ConvertTo-Json -Depth 20 -Compress
  $file = Join-Path $statusDir (([string]$obj.session_id) + '.json')
  [System.IO.File]::WriteAllText($file, $json, (New-Object System.Text.UTF8Encoding($false)))
  $prevFile = Join-Path $routerDir 'previous-statusline.txt'
  $prev = ''
  if (Test-Path -LiteralPath $prevFile) { $prev = ([System.IO.File]::ReadAllText($prevFile)).Trim() }
  if ($prev) {
    $isWin = ([Environment]::OSVersion.Platform -eq 'Win32NT')
    if ($isWin) { $res = $raw | & cmd /c $prev } else { $res = $raw | & sh -c $prev }
    $out = (@($res) -join [Environment]::NewLine)
  } else {
    $dot = [string][char]0xB7
    $parts = @()
    if ($obj.context_window -and $null -ne $obj.context_window.used_percentage) { $parts += ('ctx ' + [math]::Round([double]$obj.context_window.used_percentage) + '%') }
    if ($obj.rate_limits -and $obj.rate_limits.five_hour -and $null -ne $obj.rate_limits.five_hour.used_percentage) { $parts += ('5h ' + [math]::Round([double]$obj.rate_limits.five_hour.used_percentage) + '%') }
    if ($obj.rate_limits -and $obj.rate_limits.seven_day -and $null -ne $obj.rate_limits.seven_day.used_percentage) { $parts += ('wk ' + [math]::Round([double]$obj.rate_limits.seven_day.used_percentage) + '%') }
    $out = ($parts -join (' ' + $dot + ' '))
  }
} catch {
  try {
    if ($acct) {
      $rd = Join-Path $acct 'router'
      if (-not (Test-Path -LiteralPath $rd)) { New-Item -ItemType Directory -Force -Path $rd | Out-Null }
      $line = (Get-Date -Format o) + ' ' + $_.Exception.Message + [Environment]::NewLine
      [System.IO.File]::AppendAllText((Join-Path $rd 'reporter-errors.log'), $line)
    }
  } catch { }
  $out = 'status line unavailable'
}
if (-not $out) { $out = 'router' }
Write-Output $out
exit 0
`;

function utf16leBase64(text) {
  let bin = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    bin += String.fromCharCode(c & 0xff, c >> 8);
  }
  return btoa(bin);
}

export function encodeCommand(ps1Text) {
  return utf16leBase64(ps1Text);
}

export function statusLineCommand() {
  return "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand " + encodeCommand(REPORTER_PS1);
}

function parseSettings(text) {
  if (text == null || String(text).trim() === "") return {};
  let v;
  try {
    v = JSON.parse(text);
  } catch (e) {
    throw new Error("Your settings.json is not valid JSON, so the router did not touch it. Fix or remove the file and try again.");
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("Your settings.json is not a JSON object, so the router did not touch it.");
  }
  return v;
}

export function isInstalled(settingsText) {
  try {
    const s = parseSettings(settingsText);
    const cmd = s.statusLine && s.statusLine.command;
    return typeof cmd === "string" && cmd.includes(encodeCommand(REPORTER_PS1));
  } catch (e) {
    return false;
  }
}

export function planInstall(currentSettingsText, previousStatusLineRaw) {
  const s = parseSettings(currentSettingsText);
  const backupText = currentSettingsText == null || String(currentSettingsText).trim() === "" ? "{}" : currentSettingsText;
  let previousStatusLineJson;
  let previousCommandText;
  if (isInstalled(currentSettingsText) && previousStatusLineRaw != null) {
    previousStatusLineJson = previousStatusLineRaw;
    let prev = null;
    try { prev = JSON.parse(previousStatusLineRaw); } catch (e) { prev = null; }
    previousCommandText = prev && typeof prev.command === "string" ? prev.command : "";
  } else {
    const old = s.statusLine === undefined ? null : s.statusLine;
    previousStatusLineJson = JSON.stringify(old);
    previousCommandText = old && typeof old.command === "string" ? old.command : "";
  }
  const next = { ...s, statusLine: { type: "command", command: statusLineCommand() } };
  return { settingsText: JSON.stringify(next, null, 2) + "\n", backupText, previousStatusLineJson, previousCommandText };
}

export function planRemove(currentSettingsText, previousStatusLineJsonText) {
  const s = parseSettings(currentSettingsText);
  let prev = null;
  if (previousStatusLineJsonText != null && String(previousStatusLineJsonText).trim() !== "") {
    try { prev = JSON.parse(previousStatusLineJsonText); } catch (e) { prev = null; }
  }
  const next = { ...s };
  if (prev === null || prev === undefined) delete next.statusLine;
  else next.statusLine = prev;
  return { settingsText: JSON.stringify(next, null, 2) + "\n" };
}
