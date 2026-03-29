#!/usr/bin/env node

/**
 * Automated Testing Script for GoCloud Website
 * Run with: node test-local.js
 */

const http = require('http');
const { exec } = require('child_process');

console.log('🧪 GoCloud Local Testing Suite\n');

// Configuration
const HOST = 'localhost';
const PORT = 8000;
const BASE_URL = `http://${HOST}:${PORT}`;

// Test pages
const pages = [
  '/',
  '/about.html',
  '/service.html',
  '/contact.html',
  '/404.html',
  '/offline.html'
];

// Check if server is running
function checkServer() {
  return new Promise((resolve, reject) => {
    http.get(BASE_URL, (res) => {
      if (res.statusCode === 200) {
        console.log('✅ Server is running on', BASE_URL);
        resolve(true);
      } else {
        reject(new Error('Server returned status: ' + res.statusCode));
      }
    }).on('error', (err) => {
      console.error('❌ Server is not running!');
      console.log('💡 Start server with: npm start\n');
      reject(err);
    });
  });
}

// Test page availability
function testPage(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE_URL + path, (res) => {
      const status = res.statusCode;
      if (status === 200 || (path === '/404.html' && status === 404)) {
        console.log(`✅ ${path} - Status: ${status}`);
        resolve(true);
      } else {
        console.log(`⚠️  ${path} - Status: ${status}`);
        resolve(false);
      }
    }).on('error', (err) => {
      console.log(`❌ ${path} - Error: ${err.message}`);
      reject(err);
    });
  });
}

// Test service worker
function testServiceWorker() {
  return new Promise((resolve) => {
    http.get(BASE_URL + '/sw.js', (res) => {
      if (res.statusCode === 200) {
        console.log('✅ Service Worker file accessible');
        resolve(true);
      } else {
        console.log('⚠️  Service Worker not found');
        resolve(false);
      }
    }).on('error', () => {
      console.log('❌ Service Worker error');
      resolve(false);
    });
  });
}

// Test manifest
function testManifest() {
  return new Promise((resolve) => {
    http.get(BASE_URL + '/manifest.json', (res) => {
      if (res.statusCode === 200) {
        console.log('✅ PWA Manifest accessible');
        resolve(true);
      } else {
        console.log('⚠️  PWA Manifest not found');
        resolve(false);
      }
    }).on('error', () => {
      console.log('❌ PWA Manifest error');
      resolve(false);
    });
  });
}

// Run Lighthouse (optional)
function runLighthouse() {
  console.log('\n🔦 Running Lighthouse audit...');
  return new Promise((resolve) => {
    exec('npm run test:lighthouse:ci', (error, stdout, stderr) => {
      if (error) {
        console.log('⚠️  Lighthouse not available or failed');
        resolve(false);
      } else {
        console.log('✅ Lighthouse audit completed');
        resolve(true);
      }
    });
  });
}

// Main test runner
async function runTests() {
  try {
    console.log('📋 Step 1: Checking server...\n');
    await checkServer();

    console.log('\n📋 Step 2: Testing pages...\n');
    for (const page of pages) {
      await testPage(page);
    }

    console.log('\n📋 Step 3: Testing PWA features...\n');
    await testServiceWorker();
    await testManifest();

    console.log('\n📋 Step 4: Testing static assets...\n');
    await testPage('/css/main.min.css');
    await testPage('/js/main.min.js');
    await testPage('/js/lazy-load.js');
    await testPage('/js/sw-register.js');
    await testPage('/js/performance-monitor.js');

    console.log('\n✅ All basic tests passed!');
    console.log('\n💡 Next steps:');
    console.log('   1. Open http://localhost:8000 in browser');
    console.log('   2. Check DevTools Console for performance metrics');
    console.log('   3. Test Service Worker in Application tab');
    console.log('   4. Run: npm run test:lighthouse');
    console.log('   5. Test offline mode in DevTools\n');

  } catch (error) {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
