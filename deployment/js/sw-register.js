/**
 * Service Worker Registration
 * Registers the service worker for offline support and caching
 */

(function() {
  'use strict';

  // Check for service worker support
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported in this browser');
    return;
  }

  // Register service worker
  function registerServiceWorker() {
    navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    })
    .then(registration => {
      console.log('✅ Service Worker registered successfully:', registration.scope);

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('🔄 Service Worker update found');

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker available
            console.log('✨ New version available! Please refresh.');
            showUpdateNotification();
          }
        });
      });

      // Check for updates every hour
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);
    })
    .catch(error => {
      console.error('❌ Service Worker registration failed:', error);
    });
  }

  // Show update notification
  function showUpdateNotification() {
    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'sw-update-notification';
    notification.innerHTML = `
      <div style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #2563eb;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: system-ui, -apple-system, sans-serif;
        max-width: 350px;
      ">
        <div style="font-weight: 600; margin-bottom: 8px;">
          ✨ New Version Available
        </div>
        <div style="font-size: 14px; margin-bottom: 12px;">
          A new version of GoCloud website is ready.
        </div>
        <button id="sw-update-btn" style="
          background: white;
          color: #2563eb;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
        ">
          Refresh Now
        </button>
        <button id="sw-dismiss-btn" style="
          background: transparent;
          color: white;
          border: 1px solid white;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          margin-left: 8px;
        ">
          Later
        </button>
      </div>
    `;

    document.body.appendChild(notification);

    // Handle refresh button
    document.getElementById('sw-update-btn').addEventListener('click', () => {
      window.location.reload();
    });

    // Handle dismiss button
    document.getElementById('sw-dismiss-btn').addEventListener('click', () => {
      notification.remove();
    });
  }

  // Register when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerServiceWorker);
  } else {
    registerServiceWorker();
  }

  // Handle page visibility change
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      navigator.serviceWorker.getRegistration().then(registration => {
        if (registration) {
          registration.update();
        }
      });
    }
  });

})();
