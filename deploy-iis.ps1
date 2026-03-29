# GoCloud Website - IIS Deployment Script
# Run this script to prepare and deploy the website

param(
    [string]$DeployPath = "C:\inetpub\wwwroot\gocloud",
    [switch]$BuildOnly = $false,
    [switch]$SkipBuild = $false
)

Write-Host "🚀 GoCloud Website Deployment Script" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = $PSScriptRoot
$DeploymentFolder = Join-Path $ProjectRoot "deployment"

# Step 1: Build Project
if (-not $SkipBuild) {
    Write-Host "📦 Step 1: Building project..." -ForegroundColor Yellow
    
    # Compile Pug to HTML
    Write-Host "  → Compiling Pug templates..." -ForegroundColor Gray
    npm run build 2>&1 | Out-Null
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Build failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  ✓ Build completed" -ForegroundColor Green
    
    # Minify JavaScript files
    Write-Host "  → Minifying JavaScript..." -ForegroundColor Gray
    
    # Check if source files exist before minifying
    if (Test-Path "js\lazy-load.js") {
        npx terser js/lazy-load.js -o js/lazy-load.min.js --compress --mangle 2>&1 | Out-Null
    }
    if (Test-Path "js\sw-register.js") {
        npx terser js/sw-register.js -o js/sw-register.min.js --compress --mangle 2>&1 | Out-Null
    }
    if (Test-Path "js\performance-monitor.js") {
        npx terser js/performance-monitor.js -o js/performance-monitor.min.js --compress --mangle 2>&1 | Out-Null
    }
    
    Write-Host "  ✓ Optimization completed" -ForegroundColor Green
    Write-Host ""
}

# Step 2: Create Deployment Folder
Write-Host "📁 Step 2: Preparing deployment folder..." -ForegroundColor Yellow

if (Test-Path $DeploymentFolder) {
    Write-Host "  → Cleaning existing deployment folder..." -ForegroundColor Gray
    Remove-Item -Path $DeploymentFolder -Recurse -Force
}

New-Item -ItemType Directory -Path $DeploymentFolder -Force | Out-Null
Write-Host "  ✓ Deployment folder created: $DeploymentFolder" -ForegroundColor Green
Write-Host ""

# Step 3: Copy Files
Write-Host "📋 Step 3: Copying files..." -ForegroundColor Yellow

# Copy HTML files
Write-Host "  → Copying HTML files..." -ForegroundColor Gray
$htmlFiles = @(
    "index.html",
    "about.html", 
    "service.html",
    "portfolio.html",
    "contact.html",
    "business.html",
    "cloud-services.html",
    "odoo-dev.html",
    "odoo-imp.html",
    "conditions-terms.html",
    "privacy.html",
    "404.html",
    "offline.html"
)

foreach ($file in $htmlFiles) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination $DeploymentFolder -Force
    } else {
        Write-Host "  ⚠ Warning: $file not found" -ForegroundColor Yellow
    }
}

# Copy directories
Write-Host "  → Copying CSS directory..." -ForegroundColor Gray
if (Test-Path "css") {
    Copy-Item -Path "css" -Destination $DeploymentFolder -Recurse -Force
}

Write-Host "  → Copying JavaScript directory..." -ForegroundColor Gray
if (Test-Path "js") {
    Copy-Item -Path "js" -Destination $DeploymentFolder -Recurse -Force
}

Write-Host "  → Copying images directory..." -ForegroundColor Gray
if (Test-Path "images") {
    Copy-Item -Path "images" -Destination $DeploymentFolder -Recurse -Force
}

Write-Host "  → Copying fonts directory..." -ForegroundColor Gray
if (Test-Path "fonts") {
    Copy-Item -Path "fonts" -Destination $DeploymentFolder -Recurse -Force
}

# Copy root files
Write-Host "  → Copying configuration files..." -ForegroundColor Gray
$rootFiles = @(
    "web.config",
    "manifest.json",
    "sw.js",
    "robots.txt",
    "sitemap.xml"
)

foreach ($file in $rootFiles) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination $DeploymentFolder -Force
    } else {
        Write-Host "  ⚠ Warning: $file not found" -ForegroundColor Yellow
    }
}

Write-Host "  ✓ Files copied successfully" -ForegroundColor Green
Write-Host ""

# Step 4: Create Deployment Package Info
Write-Host "📊 Step 4: Creating deployment info..." -ForegroundColor Yellow

$deployInfo = @"
GoCloud Website Deployment Package
===================================
Created: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Version: 2.0.0
Build: Production

Files Included:
- HTML pages: $($htmlFiles.Count)
- CSS directory
- JavaScript directory  
- Images directory
- Fonts directory
- Configuration files

Deployment Instructions:
1. Copy all files to IIS web root
2. Ensure URL Rewrite module is installed
3. Configure SSL certificate
4. Test HTTPS redirect
5. Verify PWA functionality

For detailed instructions, see: DEPLOYMENT_IIS.md
"@

$deployInfo | Out-File -FilePath (Join-Path $DeploymentFolder "DEPLOYMENT_INFO.txt") -Encoding UTF8
Write-Host "  ✓ Deployment info created" -ForegroundColor Green
Write-Host ""

# Step 5: Calculate Size
$deploySize = (Get-ChildItem -Path $DeploymentFolder -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "📦 Deployment package size: $([math]::Round($deploySize, 2)) MB" -ForegroundColor Cyan
Write-Host ""

# Stop here if BuildOnly flag is set
if ($BuildOnly) {
    Write-Host "✅ Build completed. Deployment package ready at:" -ForegroundColor Green
    Write-Host "   $DeploymentFolder" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Review files in deployment folder"
    Write-Host "   2. Test locally before deploying"
    Write-Host "   3. Upload to IIS server"
    Write-Host ""
    exit 0
}

# Step 6: Deploy to IIS (optional)
Write-Host "🚀 Step 6: Deploying to IIS..." -ForegroundColor Yellow

if (-not (Test-Path $DeployPath)) {
    Write-Host "  → Creating deployment directory: $DeployPath" -ForegroundColor Gray
    try {
        New-Item -ItemType Directory -Path $DeployPath -Force | Out-Null
    } catch {
        Write-Host "  ✗ Failed to create directory. Check permissions." -ForegroundColor Red
        Write-Host "  ℹ Run PowerShell as Administrator" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "  → Copying files to IIS directory..." -ForegroundColor Gray
try {
    Copy-Item -Path (Join-Path $DeploymentFolder "*") -Destination $DeployPath -Recurse -Force
    Write-Host "  ✓ Files deployed successfully" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Deployment failed: $_" -ForegroundColor Red
    Write-Host "  ℹ Ensure you have write permissions to $DeployPath" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 7: Verify Deployment
Write-Host "✅ Deployment Summary" -ForegroundColor Green
Write-Host "=====================" -ForegroundColor Green
Write-Host "Source: $ProjectRoot" -ForegroundColor White
Write-Host "Staging: $DeploymentFolder" -ForegroundColor White
Write-Host "IIS Path: $DeployPath" -ForegroundColor White
Write-Host ""

Write-Host "📋 Post-Deployment Checklist:" -ForegroundColor Cyan
Write-Host "  □ Configure IIS website binding" 
Write-Host "  □ Install SSL certificate"
Write-Host "  □ Test HTTPS redirect"
Write-Host "  □ Verify service worker registration"
Write-Host "  □ Test PWA installation"
Write-Host "  □ Run Lighthouse audit"
Write-Host "  □ Test on mobile devices"
Write-Host ""

Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Useful Commands:" -ForegroundColor Cyan
Write-Host "   Test site: http://localhost" -ForegroundColor White
Write-Host "   IIS Manager: inetmgr" -ForegroundColor White
Write-Host "   Restart IIS: iisreset" -ForegroundColor White
Write-Host ""
