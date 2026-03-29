# 🚀 Quick Deployment Guide - GoCloud to IIS

## ⚡ Fast Track (5 Minutes)

### Prerequisites
- ✅ IIS installed on Windows Server
- ✅ URL Rewrite Module installed
- ✅ Node.js installed locally

---

## 🎯 Deployment Steps

### 1️⃣ Build Project (2 min)

```powershell
cd "E:\OneDriveFolder\OneDrive\Work\GoCloud\Docs\Gocloud_profile_project"

# Build HTML from Pug
npm run build

# Minify new JavaScript files (if not already done)
npx terser js/lazy-load.js -o js/lazy-load.min.js --compress --mangle
npx terser js/sw-register.js -o js/sw-register.min.js --compress --mangle
npx terser js/performance-monitor.js -o js/performance-monitor.min.js --compress --mangle
```

### 2️⃣ Run Deployment Script (1 min)

**Option A: Build Only (Create Deployment Package)**
```powershell
.\deploy-iis.ps1 -BuildOnly
```
This creates a `deployment` folder with all files ready to upload.

**Option B: Build & Deploy to IIS**
```powershell
# Deploy to default IIS path
.\deploy-iis.ps1

# Or specify custom path
.\deploy-iis.ps1 -DeployPath "C:\inetpub\wwwroot\gocloud"
```

**Note:** Run PowerShell as Administrator for deployment to IIS.

### 3️⃣ Configure IIS (2 min)

1. **Open IIS Manager**
   ```
   Win + R → inetmgr
   ```

2. **Create/Configure Website**
   - Right-click "Sites" → Add Website
   - Name: GoCloud
   - Physical path: `C:\inetpub\wwwroot\gocloud`
   - Binding: Port 80 (HTTP)
   - Start website

3. **Configure SSL** (if you have certificate)
   - Site → Bindings → Add
   - Type: HTTPS
   - Port: 443
   - SSL Certificate: Select your certificate

---

## 📋 Files to Deploy

### ✅ Required Files (Auto-copied by script)
```
deployment/
├── *.html (13 HTML files)
├── web.config ⭐ (IIS configuration)
├── manifest.json
├── sw.js
├── robots.txt
├── sitemap.xml
├── css/
├── js/
├── images/
└── fonts/
```

---

## 🔧 Manual Deployment (Without Script)

### Step 1: Build
```powershell
npm run build
```

### Step 2: Copy Files
Copy these to `C:\inetpub\wwwroot\`:
- All `.html` files
- `web.config` ⭐ **IMPORTANT**
- `manifest.json`, `sw.js`, `robots.txt`, `sitemap.xml`
- `css/`, `js/`, `images/`, `fonts/` directories

### Step 3: Configure IIS
- Set up website in IIS Manager
- Configure bindings (HTTP/HTTPS)

---

## ✅ Quick Verification

### Test Locally First
```powershell
# Start local server
npm start

# Open browser
http://localhost:8000

# Check:
✓ All pages load
✓ Console has no errors
✓ Service worker registers
✓ Images load
```

### Test on IIS
```powershell
# After deployment, test:
http://localhost          # or your server IP
https://yourdomain.com    # if SSL configured

# Check:
✓ Site loads
✓ HTTPS redirect works (if configured)
✓ Service worker works
✓ 404 page works
✓ No errors in browser console
```

---

## 🐛 Common Issues

### Issue: Site doesn't load
**Fix:** Check IIS website is started and bindings are correct

### Issue: 500 Error
**Fix:** Check `web.config` syntax and IIS error logs

### Issue: CSS/JS not loading
**Fix:** 
- Verify file paths in HTML
- Check IIS MIME types
- Clear browser cache

### Issue: Service Worker not registering
**Fix:** 
- HTTPS must be enabled
- Check browser console for errors
- Verify `sw.js` is accessible

---

## 🔒 SSL Certificate Setup

### Free SSL with Let's Encrypt

1. **Download Certify The Web**
   ```
   https://certifytheweb.com/
   ```

2. **Install & Configure**
   - Run Certify The Web
   - Click "New Certificate"
   - Select your IIS website
   - Choose "Let's Encrypt"
   - Click "Request Certificate"

3. **Auto-Renewal**
   - Enabled by default
   - Renews every 60 days automatically

---

## 📊 Post-Deployment Checklist

```
□ Website loads on HTTP
□ HTTPS configured (if applicable)
□ HTTP redirects to HTTPS
□ All pages accessible
□ Images load correctly
□ Service worker registers
□ PWA installable
□ 404 page displays
□ Mobile responsive
□ No console errors
□ Lighthouse score > 90
```

---

## 🎯 One-Command Deployment

**For subsequent deployments:**
```powershell
# Rebuild and redeploy
.\deploy-iis.ps1 -DeployPath "C:\inetpub\wwwroot\gocloud"
```

---

## 📞 Quick Help

### Restart IIS
```powershell
iisreset
```

### Check IIS Logs
```powershell
notepad C:\inetpub\logs\LogFiles\W3SVC1\[latest-log-file].log
```

### Test HTTPS Redirect
```powershell
curl -I http://yourdomain.com
# Should return: 301 or 302 redirect to HTTPS
```

### Verify Compression
```powershell
curl -I -H "Accept-Encoding: gzip" https://yourdomain.com
# Should include: Content-Encoding: gzip
```

---

## 🎉 Success!

Your GoCloud website is now live on IIS! 🚀

**Next Steps:**
1. Monitor performance with Lighthouse
2. Set up SSL auto-renewal
3. Configure backups
4. Monitor IIS logs

---

**For detailed instructions, see:** `DEPLOYMENT_IIS.md`
