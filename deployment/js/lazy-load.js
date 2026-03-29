/**
 * Lazy Loading Images
 * Implements Intersection Observer for lazy loading images
 * Improves initial page load performance
 */

(function() {
  'use strict';

  // Check for Intersection Observer support
  if (!('IntersectionObserver' in window)) {
    console.warn('IntersectionObserver not supported, loading all images immediately');
    loadAllImages();
    return;
  }

  // Configuration
  const config = {
    rootMargin: '50px 0px',
    threshold: 0.01
  };

  // Create observer
  const imageObserver = new IntersectionObserver(function(entries, observer) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        const img = entry.target;
        loadImage(img);
        observer.unobserve(img);
      }
    });
  }, config);

  // Load image function
  function loadImage(img) {
    // Handle srcset
    if (img.dataset.srcset) {
      img.srcset = img.dataset.srcset;
    }
    
    // Handle src
    if (img.dataset.src) {
      img.src = img.dataset.src;
    }

    // Handle background images
    if (img.dataset.bg) {
      img.style.backgroundImage = 'url(' + img.dataset.bg + ')';
    }

    // Add loaded class
    img.classList.add('lazy-loaded');
    
    // Remove loading class
    img.classList.remove('lazy-loading');

    // Trigger event
    img.dispatchEvent(new Event('lazyloaded'));
  }

  // Load all images (fallback)
  function loadAllImages() {
    const images = document.querySelectorAll('img[data-src], [data-bg]');
    images.forEach(function(img) {
      loadImage(img);
    });
  }

  // Initialize lazy loading
  function init() {
    // Get all lazy images
    const lazyImages = document.querySelectorAll('img[data-src], [data-bg]');
    
    // Add loading class
    lazyImages.forEach(function(img) {
      img.classList.add('lazy-loading');
      imageObserver.observe(img);
    });

    console.log('Lazy loading initialized for ' + lazyImages.length + ' images');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API
  window.LazyLoad = {
    init: init,
    loadImage: loadImage
  };

})();
