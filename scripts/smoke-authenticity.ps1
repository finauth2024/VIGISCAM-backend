<#
  Azure smoke test for the deepfake-image ENSEMBLE, end-to-end through the
  DEPLOYED backend (which calls the deployed AI worker). Proves the AI core is
  live across the platform, not just locally.

  Runs LIVE_FACE_SEAL on:
    - a known DEEPFAKE  -> expect result=FAIL (ensemble flags it)
    - a known REAL face -> expect result=PASS

  Usage (PowerShell):
    $env:API_BASE = "https://<backend-fqdn>/api/v1"   # same host the frontend uses
    $env:ADMIN_EMAIL = "you@vigiscam..."
    $env:ADMIN_PASSWORD = "..."
    ./scripts/smoke-authenticity.ps1
#>
$ErrorActionPreference = "Stop"
$base = $env:API_BASE
if (-not $base) { throw "Set API_BASE (e.g. https://<backend-fqdn>/api/v1)" }
if (-not $env:ADMIN_EMAIL -or -not $env:ADMIN_PASSWORD) { throw "Set ADMIN_EMAIL and ADMIN_PASSWORD" }

function Post($path, $bodyObj, $token) {
  $headers = @{ "Content-Type" = "application/json" }
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  return Invoke-RestMethod -Method Post -Uri "$base$path" -Headers $headers -Body ($bodyObj | ConvertTo-Json -Depth 8)
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
  $res = Post "/intelligence/authenticity" @{
    sessionId = $sid
    checkType = "LIVE_FACE_SEAL"
    payload   = @{ imageUrl = $s.url }
  } $token
  $dec = $res.decision
  $match = ($res.result -eq $s.expect)
  if ($match) { $ok = "OK"; $color = "Green" } else { $ok = "MISS"; $color = "Red"; $fail++ }
  Write-Host ("   result={0} score={1} model={2} tier={3}  [{4}]" -f `
      $res.result, $res.score, $dec.model_used, $dec.tier, $ok) -ForegroundColor $color
  Write-Host ("   decision: " + ($dec | ConvertTo-Json -Depth 6 -Compress))
}

Write-Host ""
if ($fail -eq 0) {
  Write-Host "ENSEMBLE SMOKE PASSED — deepfake flagged FAIL, real flagged PASS, live on Azure." -ForegroundColor Green
  exit 0
} else {
  Write-Host "ENSEMBLE SMOKE FAILED — $fail sample(s) misclassified. Check that the AI deploy rolled out + AI_SERVICE_URL is set on the backend." -ForegroundColor Red
  exit 1
}
