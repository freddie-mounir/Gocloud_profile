/**
 * Performance Monitoring
 * Tracks Core Web Vitals and reports performance metrics
 */

(function() {
  'use strict';

  // Check for Performance API support
  if (!window.performance || !window.PerformanceObserver) {
    console.warn('Performance API not supported');
    return;
  }

  // Store metrics
  const metrics = {};

  // Track Largest Contentful Paint (LCP)
  function trackLCP() {
    const observer = new PerformanceObserver(list => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      
      metrics.lcp = {
        value: lastEntry.renderTime || lastEntry.loadTime,
        rating: getRating(lastEntry.renderTime || lastEntry.loadTime, [2500, 4000]),
        element: lastEntry.element?.tagName
      };

      console.log('📊 LCP:', metrics.lcp.value.toFixed(2) + 'ms', metrics.lcp.rating);
      sendMetric('LCP', metrics.lcp);
    });

    try {
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {
      console.warn('LCP observation failed:', e);
    }
  }

  // Track First Input Delay (FID)
  function trackFID() {
    const observer = new PerformanceObserver(list => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        metrics.fid = {
          value: entry.processingStart - entry.startTime,
          rating: getRating(entry.processingStart - entry.startTime, [100, 300]),
          eventType: entry.name
        };

        console.log('⚡ FID:', metrics.fid.value.toFixed(2) + 'ms', metrics.fid.rating);
        sendMetric('FID', metrics.fid);
      });
    });

    try {
      observer.observe({ type: 'first-input', buffered: true });
    } catch (e) {
      console.warn('FID observation failed:', e);
    }
  }

  // Track Cumulative Layout Shift (CLS)
  function trackCLS() {
    let clsValue = 0;
    let clsEntries = [];

    const observer = new PerformanceObserver(list => {
      const entries = list.getEntries();
      
      entries.forEach(entry => {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          clsEntries.push(entry);
        }
      });

      metrics.cls = {
        value: clsValue,
        rating: getRating(clsValue, [0.1, 0.25]),
        shifts: clsEntries.length
      };

      console.log('📐 CLS:', metrics.cls.value.toFixed(3), metrics.cls.rating);
    });

    try {
      observer.observe({ type: 'layout-shift', buffered: true });
    } catch (e) {
      console.warn('CLS observation failed:', e);
    }

    // Report CLS on page hide
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && metrics.cls) {
        sendMetric('CLS', metrics.cls);
      }
    });
  }

  // Track Time to First Byte (TTFB)
  function trackTTFB() {
    const navEntry = performance.getEntriesByType('navigation')[0];
    
    if (navEntry) {
      metrics.ttfb = {
        value: navEntry.responseStart - navEntry.requestStart,
        rating: getRating(navEntry.responseStart - navEntry.requestStart, [800, 1800])
      };

      console.log('🚀 TTFB:', metrics.ttfb.value.toFixed(2) + 'ms', metrics.ttfb.rating);
      sendMetric('TTFB', metrics.ttfb);
    }
  }

  // Track First Contentful Paint (FCP)
  function trackFCP() {
    const observer = new PerformanceObserver(list => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        if (entry.name === 'first-contentful-paint') {
          metrics.fcp = {
            value: entry.startTime,
            rating: getRating(entry.startTime, [1800, 3000])
          };

          console.log('🎨 FCP:', metrics.fcp.value.toFixed(2) + 'ms', metrics.fcp.rating);
          sendMetric('FCP', metrics.fcp);
        }
      });
    });

    try {
      observer.observe({ type: 'paint', buffered: true });
    } catch (e) {
      console.warn('FCP observation failed:', e);
    }
  }

  // Get rating based on thresholds
  function getRating(value, thresholds) {
    if (value <= thresholds[0]) {
      return 'good';
    }
    if (value <= thresholds[1]) {
      return 'needs-improvement';
    }
    return 'poor';
  }

  // Send metric to analytics
  function sendMetric(name, metric) {
    // Log to console (replace with actual analytics)
    console.log(`📈 Metric [${name}]:`, metric);

    // Example: Send to Google Analytics
    if (window.gtag) {
      window.gtag('event', name, {
        event_category: 'Web Vitals',
        value: Math.round(metric.value),
        event_label: metric.rating,
        non_interaction: true
      });
    }

    // Example: Send to custom analytics endpoint
    /*
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metric: name,
        value: metric.value,
        rating: metric.rating,
        url: window.location.href,
        timestamp: Date.now()
      })
    }).catch(console.error);
    */
  }

  // Track page load timing
  function trackPageLoad() {
    if (document.readyState === 'complete') {
      reportPageLoad();
    } else {
      addEventListener('load', reportPageLoad);
    }
  }

  function reportPageLoad() {
    const navTiming = performance.getEntriesByType('navigation')[0];
    
    if (navTiming) {
      const loadMetrics = {
        dns: navTiming.domainLookupEnd - navTiming.domainLookupStart,
        tcp: navTiming.connectEnd - navTiming.connectStart,
        request: navTiming.responseStart - navTiming.requestStart,
        response: navTiming.responseEnd - navTiming.responseStart,
        domParsing: navTiming.domInteractive - navTiming.responseEnd,
        domContentLoaded: navTiming.domContentLoadedEventEnd - navTiming.domContentLoadedEventStart,
        totalLoad: navTiming.loadEventEnd - navTiming.navigationStart
      };

      console.log('⏱️ Page Load Timing:', loadMetrics);
      metrics.pageLoad = loadMetrics;
    }
  }

  // Generate performance report
  function generateReport() {
    console.group('🎯 Performance Report');
    console.log('Core Web Vitals:', metrics);
    
    // Calculate overall score
    const scores = {
      good: 0,
      needsImprovement: 0,
      poor: 0
    };

    Object.values(metrics).forEach(metric => {
      if (metric.rating === 'good') {
        scores.good++;
      } else if (metric.rating === 'needs-improvement') {
        scores.needsImprovement++;
      } else if (metric.rating === 'poor') {
        scores.poor++;
      }
    });

    console.log('Overall Performance:', scores);
    console.groupEnd();

    return metrics;
  }

  // Initialize monitoring
  function init() {
    trackLCP();
    trackFID();
    trackCLS();
    trackTTFB();
    trackFCP();
    trackPageLoad();

    // Generate report after 10 seconds
    setTimeout(generateReport, 10000);
  }

  // Start monitoring
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API
  window.PerformanceMonitor = {
    getMetrics: () => metrics,
    generateReport: generateReport
  };

})();
