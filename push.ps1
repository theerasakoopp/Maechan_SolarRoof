# Maechan_SolarRoof Git Sync & Deploy Script
param (
    [string]$msg = "Deploy Maechan Smart SolarRoof WebGIS ($(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))"
)

# Detect Git path
$gitCandidates = @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Users\$env:USERNAME\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe"
)

$gitPath = "git"
foreach ($candidate in $gitCandidates) {
    if (Test-Path $candidate) {
        $gitPath = $candidate
        break
    }
}
if ($gitPath -eq "git") {
    $found = Get-Command "git" -ErrorAction SilentlyContinue
    if ($found) {
        $gitPath = $found.Source
    }
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " 🚀 Maechan_SolarRoof: Git Sync & Deploy" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Repository: D:\UAV-SolarNet\Maechan_SolarRoof" -ForegroundColor Gray
Write-Host "Using Git: $gitPath" -ForegroundColor Gray
Write-Host ""

Set-Location -Path $PSScriptRoot

Write-Host "1. Staging changes..." -ForegroundColor Cyan
& $gitPath add -A

$status = & $gitPath status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "[INFO] Working tree is clean. No new changes to commit." -ForegroundColor Yellow
} else {
    Write-Host "2. Committing changes..." -ForegroundColor Cyan
    & $gitPath commit -m "$msg"
}

Write-Host "3. Pushing to GitHub (main branch)..." -ForegroundColor Cyan
& $gitPath push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] Pushed to https://github.com/theerasakoopp/Maechan_SolarRoof" -ForegroundColor Green
    Write-Host " Live Site: https://theerasakoopp.github.io/Maechan_SolarRoof/" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Git push failed. Please check your network or credentials." -ForegroundColor Red
}
