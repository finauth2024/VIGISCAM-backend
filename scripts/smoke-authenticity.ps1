<#
  Azure smoke test for the deepfake-image ENSEMBLE, end-to-end through the
  DEPLOYED backend (which calls the deployed AI worker). Proves the AI core is
  live across the platform.

  Sends the image as base64 BYTES (downloaded locally) rather than a URL, so the
  worker scores the exact same pixels the local eval did — no dependency on the
  worker's outbound egress being able to fetch a third-party URL.

  Runs LIVE_FACE_SEAL on:
    - a known DEEPFAKE  -> expect result=FAIL, source=EXTERNAL
    - a known REAL face -> expect result=PASS, source=EXTERNAL

  The `source` field is the key diagnostic:
    EXTERNAL = the real AI worker (ensemble) produced the verdict
    STUB     = the backend could NOT reach the worker and fell back

  Usage (PowerShell):
    $env:API_BASE = "https://<backend-fqdn>/api/v1"
    $env:ADMIN_EMAIL = "..."
    $env:ADMIN_PASSWORD = "..."
    ./scripts/smoke-authenticity.ps1
#>
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base = $env:API_BASE
if (-not $base) { throw "Set API_BASE (e.g. https://<backend-fqdn>/api/v1)" }
if (-not $env:ADMIN_EMAIL -or -not $env:ADMIN_PASSWORD) { throw "Set ADMIN_EMAIL and ADMIN_PASSWORD" }

function Post($path, $bodyObj, $token) {
  $headers = @{ "Content-Type" = "application/json" }
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  return Invoke-RestMethod -Method Post -Uri "$base$path" -Headers $headers -Body ($bodyObj | ConvertTo-Json -Depth 8)
}

function DownloadB64($url) {
  $wc = New-Object System.Net.WebClient
  $wc.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VIGISCAM-smoke")
  $bytes = $wc.DownloadData($url)
  return [Convert]::ToBase64String($bytes)
}

Write-Host "1) Login..." -ForegroundColor Cyan
$auth = Post "/auth/login" @{ email = $env:ADMIN_EMAIL; password = $env:ADMIN_PASSWORD } $null
$token = $auth.accessToken
Write-Host "   token acquired."

Write-Host "2) Create a monitored session..." -ForegroundColor Cyan
$session = Post "/sessions" @{ type = "VIDEO" } $token
$sid = $session.id
Write-Host "   sessionId = $sid"

$samples = @(
  @{ name = "DEEPFAKE Tom Cruise"; expect = "FAIL"; url = "https://warroom.armywarcollege.edu/wp-content/uploads/21-057-Deep_fake_Tom_Cruise.jpeg" },
  @{ name = "REAL portrait";       expect = "PASS"; url = "https://commons.wikimedia.org/wiki/Special:FilePath/03alcob.jpg" }
)

$fail = 0
foreach ($s in $samples) {
  Write-Host "3) LIVE_FACE_SEAL on $($s.name) (expect $($s.expect))..." -ForegroundColor Cyan
  Write-Host "   downloading bytes..."
  $b64 = DownloadB64 $s.url
  $res = Post "/intelligence/authenticity" @{
    sessionId = $sid
    checkType = "LIVE_FACE_SEAL"
    payload   = @{ imageBase64 = $b64 }
  } $token

  $src = $res.source
  $dec = $res.metadata.decision
  $resultMatch = ($res.result -eq $s.expect)
  $isExternal  = ($src -eq "EXTERNAL")
  if ($resultMatch -and $isExternal) { $ok = "OK"; $color = "Green" } else { $ok = "MISS"; $color = "Red"; $fail++ }

  Write-Host ("   result={0} score={1} source={2} modelVersion={3}  [{4}]" -f `
      $res.result, $res.score, $src, $res.modelVersion, $ok) -ForegroundColor $color
  if ($dec) {
    Write-Host ("   decision: " + ($dec | ConvertTo-Json -Depth 6 -Compress))
  } else {
    Write-Host "   decision: <none>  (STUB fallback or pre-decision backend build)" -ForegroundColor Yellow
  }
}

Write-Host ""
if ($fail -eq 0) {
  Write-Host "ENSEMBLE SMOKE PASSED — deepfake FAIL + real PASS, both via EXTERNAL worker. Live on Azure." -ForegroundColor Green
  exit 0
} else {
  Write-Host "SMOKE FAILED — see source/result above." -ForegroundColor Red
  Write-Host "  source=STUB  -> backend can't reach the AI worker (check AI_SERVICE_URL + worker is running)." -ForegroundColor Yellow
  Write-Host "  source=EXTERNAL but deepfake PASS -> worker reached but verdict wrong (check worker image tag/logs)." -ForegroundColor Yellow
  exit 1
}
