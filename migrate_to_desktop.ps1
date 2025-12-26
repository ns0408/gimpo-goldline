$sourceDir = Get-Location
$destDir = "C:\Users\박남순\OneDrive\Desktop\gimpo-goldline"

Write-Host "🚀 Moving files to Git Repository: $destDir" -ForegroundColor Cyan

# Check if destination exists
if (-not (Test-Path $destDir)) {
    Write-Error "❌ Desktop folder not found! Please check if 'gimpo-goldline' exists on your Desktop."
    exit 1
}

# Define files to copy
$files = @(
    "index.html",
    "bus_routes.json",
    "insight_data.json",
    "data.json",
    "assets\script.js",
    "assets\style.css",
    "functions\predict.js",
    "functions\insights.js"
)

foreach ($file in $files) {
    $srcPath = Join-Path $sourceDir $file
    $destPath = Join-Path $destDir $file
    
    # Create directory if missing (e.g. functions)
    $parentDir = Split-Path $destPath
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Force -Path $parentDir | Out-Null
    }

    if (Test-Path $srcPath) {
        Copy-Item -Path $srcPath -Destination $destPath -Force
        Write-Host "✅ Copied: $file" -ForegroundColor Green
    } else {
        Write-Warning "⚠️ Missing source file: $file"
    }
}

Write-Host "`n🎉 Migration Complete!" -ForegroundColor Yellow
Write-Host "Now go to your Desktop folder and run Git Push:" -ForegroundColor White
Write-Host "cd $destDir"
Write-Host "git add ."
Write-Host "git commit -m `"Upgrade`""
Write-Host "git push"
