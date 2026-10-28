# GitHub Release & Asset Upload Script
$ErrorActionPreference = 'Stop'

Write-Host "Fetching GitHub credentials..."
$cred = ('protocol=https' + "`n" + 'host=github.com') | git credential fill
$token = ''
foreach ($line in ($cred -split "`n")) {
    if ($line -like 'password=*') {
        $token = $line.Substring(9).Trim()
    }
}

if (-not $token) {
    Write-Error "Could not retrieve GitHub token from Git Credential Manager."
    exit 1
}

$repoOwner = "siril0202"
$repoName = "Dynamic-island"
$tagName = "v1.0.0"
$releaseTitle = "CodeWithSiril Dynamic Island v1.0.0"
$releaseNotes = @"
## CodeWithSiril Dynamic Island for Windows

- **Official Brand:** CodeWithSiril
- **Official Website:** https://codewithsiril.site
- **Official Portfolio:** https://portfolio.codewithsiril.site
- **Authentic Vivo OriginOS & iPhone-inspired Dynamic Island for Windows**
- **Ultra-slim 30px compact pill** with cute animated vector smile, blinking eyes, and live clock
- **Real Windows media playback sync & hardware media controls**
- **Low RAM footprint** (<30MB)
- **Charging, Airbuds/Bluetooth, Volume, and Battery alerts**
- **NSIS Windows Setup installer** with Desktop & Start Menu shortcuts
"@

$headers = @{
    'Authorization' = "Bearer $token"
    'Accept' = 'application/vnd.github+json'
    'User-Agent' = 'CodeWithSiril-ReleaseManager'
}

# 1. Check if release already exists
Write-Host "Checking if release $tagName exists..."
$release = $null
try {
    $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$repoOwner/$repoName/releases/tags/$tagName" -Method Get -Headers $headers -ErrorAction SilentlyContinue
    if ($existing -and $existing.id) {
        $release = $existing
        Write-Host "Found existing release ID: $($release.id)"
    }
} catch {
    # Not found, will create
}

# 2. Create release if not exists
if (-not $release) {
    Write-Host "Creating release $tagName..."
    $releasePayload = @{
        tag_name = $tagName
        target_commitish = 'main'
        name = $releaseTitle
        body = $releaseNotes
        draft = $false
        prerelease = $false
    } | ConvertTo-Json

    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repoOwner/$repoName/releases" -Method Post -Headers $headers -Body $releasePayload -ContentType 'application/json'
    Write-Host "Release created successfully: $($release.html_url)"
}

$releaseId = $release.id
$uploadUrl = "https://uploads.github.com/repos/$repoOwner/$repoName/releases/$releaseId/assets?name=CodeWithSiril%20Dynamic%20Island%20Setup.exe"

# 3. Check if asset already exists on release
$assetPath = Join-Path $PSScriptRoot "..\dist\CodeWithSiril Dynamic Island Setup.exe"
if (-not (Test-Path $assetPath)) {
    Write-Error "Asset file not found at $assetPath"
    exit 1
}

$fileInfo = Get-Item $assetPath
Write-Host "Uploading asset: $($fileInfo.Name) ($([Math]::Round($fileInfo.Length / 1MB, 2)) MB)..."

# Delete any existing asset on this release
Write-Host "Checking for existing assets to clean up..."
try {
    $existingAssets = Invoke-RestMethod -Uri "https://api.github.com/repos/$repoOwner/$repoName/releases/$releaseId/assets" -Method Get -Headers $headers
    if ($existingAssets) {
        foreach ($a in $existingAssets) {
            Write-Host "Deleting old asset ID $($a.id) ($($a.name))..."
            Invoke-RestMethod -Uri "https://api.github.com/repos/$repoOwner/$repoName/releases/assets/$($a.id)" -Method Delete -Headers $headers
        }
    }
} catch {
    Write-Host "No existing assets to delete."
}

Start-Sleep -Seconds 2
Write-Host "Uploading asset: $($fileInfo.Name) ($([Math]::Round($fileInfo.Length / 1MB, 2)) MB)..."

# Upload asset using native curl.exe for maximum reliability with large binary files
Write-Host "Starting upload via curl..."
$uploadResponse = & curl.exe -s -S -X POST `
    -H "Authorization: Bearer $token" `
    -H "Content-Type: application/octet-stream" `
    -H "Accept: application/vnd.github+json" `
    --data-binary "@$assetPath" `
    "$uploadUrl"

$uploadedAsset = $uploadResponse | ConvertFrom-Json
if ($uploadedAsset.browser_download_url) {
    Write-Host "Asset uploaded successfully!"
    Write-Host "Download URL: $($uploadedAsset.browser_download_url)"
    Write-Host "Release URL: $($release.html_url)"
} else {
    Write-Host "Upload response: $uploadResponse"
}
