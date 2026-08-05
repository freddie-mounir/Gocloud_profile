# 🚀 IIS Deployment Guide for GoCloud Website

## 📋 **Prerequisites**

### On Your Development Machine
- [x] Node.js 18+ installed
- [x] Project built successfully
- [x] All tests passing

### On IIS Server
- [ ] Windows Server with IIS installed
- [ ] IIS URL Rewrite Module installed
- [ ] Valid SSL certificate (for HTTPS)
- [ ] FTP or Remote Desktop access

---

## 🔧 **Step 1: Build for Production**

### Option A: Quick Build (Without Clean)
```powershell
cd "E:\OneDriveFolder\OneDrive\Work\GoCloud\Docs\Gocloud_profile_project"

# Build HTML from Pug
npm run build

# Minify CSS
npm run minify:css

# Minify JavaScript
npm run minify:js
```

### Option B: Manual Clean & Build
```powershell
# Remove old HTML files
Remove-Item *.html -Exclude offline.html,404.html

# Build
npm run build

# Optimize
npm run optimize
```

---

## 📦 **Step 2: Prepare Deployment Package**

### Files to Deploy

Create a deployment folder with these files:

#### ✅ **Required HTML Files**
```
index.html
about.html
service.html
portfolio.html
contact.html
business.html
cloud-services.html
odoo-dev.html
odoo-imp.html
conditions-terms.html
privacy.html
404.html
offline.html
```

#### ✅ **Required Directories**
```
css/
  ├── main.min.css
  ├── mobile-menu.min.css
  ├── nice-select.min.css
  └── font-loading.min.css (if created)

js/
  ├── main.min.js
  ├── lazy-load.min.js (or lazy-load.js)
  ├── sw-register.min.js (or sw-register.js)
  ├── performance-monitor.min.js (or performance-monitor.js)
  ├── jquery.countup.min.js
  ├── mobile-menu.min.js
  ├── SmoothScroll.min.js
  ├── Splitetext.min.js
  ├── text-animation.min.js
  ├── typewriter.min.js
  ├── ripple-btn.min.js
  ├── jquery.lineProgressbar.min.js
  └── components.min.js

images/
  └── (all WebP and image files)

fonts/
  └── (all font files)
```

#### ✅ **Required Root Files**
```
.htaccess
web.config (create this - see below)
manifest.json
sw.js
robots.txt
sitemap.xml
```

#### ❌ **Files NOT to Deploy**
```
node_modules/
views/
components/
.vs/
.git/
.env
package.json
package-lock.json
*.config.js
.eslintrc.js
.prettierrc
test-local.js
PHASE_*.md
ENHANCEMENT_PLAN.md
```

---

## 🔄 **Step 3: Create web.config for IIS**

IIS uses `web.config` instead of `.htaccess`. Create this file:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    
    <!-- URL Rewrite Rules -->
    <rewrite>
      <rules>
        <!-- Force HTTPS -->
        <rule name="Redirect to HTTPS" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="off" ignoreCase="true" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
        </rule>
        
        <!-- Remove WWW -->
        <rule name="Remove WWW" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTP_HOST}" pattern="^www\.(.*)$" />
          </conditions>
          <action type="Redirect" url="https://{C:1}/{R:1}" redirectType="Permanent" />
        </rule>
        
        <!-- Custom Error Pages -->
        <rule name="404 Error" stopProcessing="true">
          <match url=".*" />
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/404.html" />
        </rule>
      </rules>
    </rewrite>
    
    <!-- Static Content Compression -->
    <urlCompression doStaticCompression="true" doDynamicCompression="true" />
    
    <!-- Static Content Caching -->
    <staticContent>
      <!-- WebP Images -->
      <mimeMap fileExtension=".webp" mimeType="image/webp" />
      
      <!-- Web Fonts -->
      <mimeMap fileExtension=".woff" mimeType="application/font-woff" />
      <mimeMap fileExtension=".woff2" mimeType="application/font-woff2" />
      
      <!-- PWA Files -->
      <mimeMap fileExtension=".webmanifest" mimeType="application/manifest+json" />
      
      <!-- Cache Control Headers -->
      <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="365.00:00:00" />
    </staticContent>
    
    <!-- HTTP Response Headers -->
    <httpProtocol>
      <customHeaders>
        <!-- Security Headers -->
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="X-Frame-Options" value="SAMEORIGIN" />
        <add name="X-XSS-Protection" value="1; mode=block" />
        <add name="Referrer-Policy" value="strict-origin-when-cross-origin" />
        <add name="Permissions-Policy" value="geolocation=(), microphone=(), camera=()" />
        
        <!-- HSTS (uncomment after testing HTTPS) -->
        <!-- <add name="Strict-Transport-Security" value="max-age=31536000; includeSubDomains; preload" /> -->
        
        <!-- Remove Server Header -->
        <remove name="X-Powered-By" />
      </customHeaders>
    </httpProtocol>
    
    <!-- Custom Error Pages -->
    <httpErrors errorMode="Custom" existingResponse="Replace">
      <remove statusCode="404" subStatusCode="-1" />
      <error statusCode="404" path="/404.html" responseMode="ExecuteURL" />
    </httpErrors>
    
    <!-- Compression -->
    <httpCompression>
      <dynamicTypes>
        <add mimeType="text/*" enabled="true" />
        <add mimeType="message/*" enabled="true" />
        <add mimeType="application/javascript" enabled="true" />
        <add mimeType="application/json" enabled="true" />
        <add mimeType="*/*" enabled="false" />
      </dynamicTypes>
      <staticTypes>
        <add mimeType="text/*" enabled="true" />
        <add mimeType="message/*" enabled="true" />
        <add mimeType="application/javascript" enabled="true" />
        <add mimeType="application/atom+xml" enabled="true" />
        <add mimeType="application/xaml+xml" enabled="true" />
        <add mimeType="image/svg+xml" enabled="true" />
        <add mimeType="*/*" enabled="false" />
      </staticTypes>
    </httpCompression>
    
  </system.webServer>
  
  <!-- Cache Control by File Type -->
  <location path="css">
    <system.webServer>
      <staticContent>
        <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="365.00:00:00" />
      </staticContent>
    </system.webServer>
  </location>
  
  <location path="js">
    <system.webServer>
      <staticContent>
        <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="365.00:00:00" />
      </staticContent>
    </system.webServer>
  </location>
  
  <location path="images">
    <system.webServer>
      <staticContent>
        <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="365.00:00:00" />
      </staticContent>
    </system.webServer>
  </location>
  
  <!-- No Cache for HTML -->
  <location path="index.html">
    <system.webServer>
      <staticContent>
        <clientCache cacheControlMode="DisableCache" />
      </staticContent>
    </system.webServer>
  </location>
  
  <!-- Service Worker - No Cache -->
  <location path="sw.js">
    <system.webServer>
      <staticContent>
        <clientCache cacheControlMode="DisableCache" />
      </staticContent>
      <httpProtocol>
        <customHeaders>
          <add name="Service-Worker-Allowed" value="/" />
        </customHeaders>
      </httpProtocol>
    </system.webServer>
  </location>
  
</configuration>
```

Save this as `web.config` in your project root.

---

## 📤 **Step 4: Deploy to IIS**

### Method 1: FTP Deployment

1. **Connect via FTP Client** (FileZilla, WinSCP)
   - Host: `ftp.yourdomain.com`
   - Username: Your FTP username
   - Password: Your FTP password
   - Port: 21 (or 22 for SFTP)

2. **Upload Files**
   - Upload all files to: `wwwroot/` or `public_html/`
   - Maintain directory structure
   - Ensure `web.config` is in root

3. **Set Permissions**
   - Ensure IIS user has read access
   - Service worker needs proper MIME type

### Method 2: Remote Desktop Deployment

1. **Connect to Server**
   - Use Remote Desktop Connection
   - Enter server IP and credentials

2. **Copy Files**
   - Copy deployment folder to server
   - Default IIS path: `C:\inetpub\wwwroot\`

3. **Set Up IIS Site**
   ```
   Open IIS Manager
   → Right-click "Sites"
   → Add Website
   → Set Site Name: "GoCloud"
   → Physical Path: Your deployment folder
   → Binding: HTTP/HTTPS with your domain
   ```

### Method 3: Web Deploy (Recommended)

1. **Install Web Deploy on Server**
2. **Configure Publish Profile**
3. **Deploy with one click** from Visual Studio or CLI

---

## 🔒 **Step 5: Configure SSL Certificate**

### Using Let's Encrypt (Free)

1. **Install Certify The Web** (Windows)
   - Download: https://certifytheweb.com/
   - Install and run

2. **Create Certificate**
   - Add new certificate
   - Select your IIS website
   - Choose Let's Encrypt
   - Auto-renew enabled

### Using Commercial Certificate

1. **Purchase SSL from provider**
2. **Generate CSR in IIS**
   ```
   IIS Manager → Server Certificates → Create Certificate Request
   ```
3. **Install Certificate**
   ```
   IIS Manager → Server Certificates → Complete Certificate Request
   ```
4. **Bind to Website**
   ```
   IIS Manager → Sites → Your Site → Bindings
   → Add HTTPS binding with certificate
   ```

---

## ✅ **Step 6: Post-Deployment Verification**

### Test Checklist

1. **Basic Functionality**
   ```
   ✓ https://yourdomain.com loads
   ✓ All pages accessible
   ✓ Images load correctly
   ✓ CSS/JS files load
   ```

2. **HTTPS & Security**
   ```
   ✓ HTTP redirects to HTTPS
   ✓ WWW redirects to non-WWW
   ✓ SSL certificate valid
   ✓ Security headers present
   ```

3. **PWA Features**
   ```
   ✓ Service worker registers
   ✓ Manifest.json accessible
   ✓ Offline page works
   ✓ Install prompt appears
   ```

4. **Performance**
   ```
   ✓ Gzip compression enabled
   ✓ Browser caching working
   ✓ Lazy loading functional
   ✓ Core Web Vitals good
   ```

5. **Error Handling**
   ```
   ✓ 404 page displays
   ✓ Offline mode works
   ✓ No console errors
   ```

### Verification Commands

```powershell
# Test HTTPS redirect
curl -I http://yourdomain.com

# Check compression
curl -I -H "Accept-Encoding: gzip" https://yourdomain.com

# Test SSL
curl -I https://yourdomain.com

# Check security headers
curl -I https://yourdomain.com | findstr "X-"
```

---

## 🎛️ **Step 7: IIS Server Configuration**

### Enable Compression

1. Open IIS Manager
2. Select server node
3. Open "Compression"
4. Check both static and dynamic compression
5. Apply changes

### Install URL Rewrite Module

1. Download from: https://www.iis.net/downloads/microsoft/url-rewrite
2. Run installer
3. Restart IIS

### Configure Application Pool

```
IIS Manager → Application Pools → Your Pool
→ .NET CLR Version: "No Managed Code"
→ Start Mode: AlwaysRunning
→ Idle Timeout: 0 (or 20 minutes)
→ Recycling: Regular time interval (1740 minutes)
```

---

## 🔄 **Step 8: Continuous Deployment (Optional)**

### Using GitHub Actions

Create `.github/workflows/deploy-iis.yml`:

```yaml
name: Deploy to IIS

on:
  push:
    branches: [main, production]

jobs:
  deploy:
    runs-on: windows-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm install
    
    - name: Build
      run: npm run build
    
    - name: Optimize
      run: npm run optimize
    
    - name: Deploy to IIS
      uses: SamKirkland/FTP-Deploy-Action@4.3.0
      with:
        server: ${{ secrets.FTP_SERVER }}
        username: ${{ secrets.FTP_USERNAME }}
        password: ${{ secrets.FTP_PASSWORD }}
        local-dir: ./
        server-dir: /
        exclude: |
          node_modules/**
          .git/**
          views/**
```

---

## 📊 **Step 9: Monitoring & Maintenance**

### Monitor Performance

```powershell
# Check IIS logs
Get-Content C:\inetpub\logs\LogFiles\W3SVC1\*.log -Tail 50

# Monitor CPU/Memory
perfmon
```

### Regular Maintenance

- [ ] Monitor SSL certificate expiry
- [ ] Check IIS logs weekly
- [ ] Update content regularly
- [ ] Run Lighthouse audits monthly
- [ ] Backup website files
- [ ] Update dependencies quarterly

---

## 🐛 **Troubleshooting**

### Issue: 500 Internal Server Error

**Solution:**
1. Check `web.config` syntax
2. Enable detailed errors:
   ```xml
   <httpErrors errorMode="Detailed" />
   ```
3. Check IIS error logs

### Issue: Service Worker Not Working

**Solution:**
1. Ensure HTTPS is enabled
2. Check MIME type for `.js` files
3. Verify `Service-Worker-Allowed` header
4. Clear browser cache

### Issue: Compression Not Working

**Solution:**
1. Install Dynamic Compression in IIS
2. Enable compression in IIS Manager
3. Verify `web.config` compression settings

### Issue: CSS/JS Not Loading

**Solution:**
1. Check file paths (case-sensitive)
2. Verify MIME types in IIS
3. Check file permissions
4. Clear CDN/browser cache

---

## 📋 **Quick Deployment Checklist**

```
Pre-Deployment:
□ Run npm run build
□ Run npm run optimize
□ Test locally (npm start)
□ Run Lighthouse audit
□ Commit to Git

Deployment:
□ Create web.config file
□ Upload all files to IIS
□ Configure SSL certificate
□ Set up URL rewrite
□ Enable compression
□ Test HTTPS redirect

Post-Deployment:
□ Test all pages
□ Verify PWA works
□ Check performance
□ Test on mobile
□ Monitor for 24 hours
```

---

## 🎉 **Success Criteria**

Your deployment is successful when:

- ✅ All pages load over HTTPS
- ✅ Lighthouse Performance > 90
- ✅ Lighthouse PWA = 100
- ✅ Service worker active
- ✅ Offline mode works
- ✅ SSL certificate valid
- ✅ Security headers present
- ✅ Compression enabled
- ✅ No console errors
- ✅ Mobile responsive

---

## 📞 **Support Resources**

- **IIS Documentation**: https://docs.microsoft.com/en-us/iis/
- **Let's Encrypt**: https://letsencrypt.org/
- **Certify The Web**: https://certifytheweb.com/
- **URL Rewrite**: https://www.iis.net/downloads/microsoft/url-rewrite

---

**🚀 Your GoCloud website is now ready for production deployment on IIS!**
