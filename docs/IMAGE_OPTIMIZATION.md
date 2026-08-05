# Image Optimization Guide

## 📸 Best Practices for GoCloud Website Images

### Image Formats

#### Use WebP with Fallback
```html
<picture>
  <source srcset="images/hero.webp" type="image/webp">
  <source srcset="images/hero.jpg" type="image/jpeg">
  <img src="images/hero.jpg" alt="Hero image" loading="lazy">
</picture>
```

#### When to Use Each Format
- **WebP**: Modern browsers, smaller file size (25-35% reduction)
- **JPEG**: Photos and complex images
- **PNG**: Images with transparency
- **SVG**: Icons, logos, simple graphics

### Lazy Loading Implementation

#### Method 1: Native Lazy Loading
```html
<img src="image.webp" alt="Description" loading="lazy">
```

#### Method 2: JavaScript Lazy Loading (with our script)
```html
<img data-src="image.webp" alt="Description" class="lazy-loading">
<noscript>
  <img src="image.webp" alt="Description">
</noscript>
```

### Responsive Images with srcset

```html
<img 
  srcset="
    images/hero-400.webp 400w,
    images/hero-800.webp 800w,
    images/hero-1200.webp 1200w,
    images/hero-1920.webp 1920w
  "
  sizes="
    (max-width: 640px) 400px,
    (max-width: 1024px) 800px,
    (max-width: 1920px) 1200px,
    1920px
  "
  src="images/hero-800.webp"
  alt="Hero image"
  loading="lazy"
>
```

### Image Dimensions

Always specify width and height to prevent layout shift:

```html
<img 
  src="image.webp" 
  alt="Description"
  width="800"
  height="600"
  loading="lazy"
>
```

### CSS Background Images (Lazy Load)

```html
<div 
  class="hero-section"
  data-bg="images/hero-bg.webp"
  style="min-height: 400px;"
>
  <!-- Content -->
</div>
```

### Optimization Tools

#### Command Line (ImageMagick)
```bash
# Convert to WebP
magick convert input.jpg -quality 85 output.webp

# Resize and convert
magick convert input.jpg -resize 1920x1080 -quality 85 output.webp

# Generate multiple sizes
magick convert input.jpg -resize 400x output-400.webp
magick convert input.jpg -resize 800x output-800.webp
magick convert input.jpg -resize 1200x output-1200.webp
```

#### Online Tools
- [Squoosh](https://squoosh.app/) - Google's image optimizer
- [TinyPNG](https://tinypng.com/) - PNG/JPEG compression
- [CloudConvert](https://cloudconvert.com/) - Format conversion

#### NPM Scripts (Add to package.json)
```json
{
  "scripts": {
    "optimize:images": "node scripts/optimize-images.js"
  }
}
```

### Image Optimization Checklist

- [ ] Convert all JPEGs/PNGs to WebP (with fallback)
- [ ] Implement lazy loading for below-fold images
- [ ] Add `loading="lazy"` attribute
- [ ] Specify width and height attributes
- [ ] Create responsive images with srcset
- [ ] Compress images (target: <200KB for photos)
- [ ] Use SVG for icons and logos
- [ ] Add alt text for accessibility
- [ ] Test on slow networks (3G)

### Performance Targets

| Image Type | Max Size | Format | Compression |
|------------|----------|--------|-------------|
| Hero Images | 200 KB | WebP | 85% quality |
| Content Images | 100 KB | WebP | 80% quality |
| Thumbnails | 30 KB | WebP | 75% quality |
| Icons | 5 KB | SVG | Optimized |
| Logos | 20 KB | SVG/WebP | Optimized |

### Example Image Structure

```
images/
├── hero/
│   ├── hero-400.webp
│   ├── hero-800.webp
│   ├── hero-1200.webp
│   ├── hero-1920.webp
│   └── hero-fallback.jpg
├── services/
│   ├── service-1.webp
│   ├── service-1-thumb.webp
│   └── service-1.jpg
├── icons/
│   ├── icon-72x72.png
│   ├── icon-192x192.png
│   └── icon-512x512.png
└── placeholder.webp (10KB blurred placeholder)
```

### Advanced: Blur-up Technique

```html
<div class="image-container">
  <!-- Low-quality placeholder (blurred, tiny) -->
  <img 
    src="placeholder-tiny.jpg" 
    class="placeholder"
    style="filter: blur(20px);"
  >
  <!-- High-quality image (lazy loaded) -->
  <img 
    data-src="image-full.webp"
    class="lazy-loading"
    alt="Description"
  >
</div>
```

### CSS for Lazy Loading

```css
/* Loading state */
img.lazy-loading {
  opacity: 0;
  transition: opacity 0.3s ease-in;
}

/* Loaded state */
img.lazy-loaded {
  opacity: 1;
}

/* Placeholder blur */
.placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Hide placeholder when loaded */
.lazy-loaded + .placeholder {
  opacity: 0;
}
```

### Monitor Image Performance

Use our performance monitor to track LCP (Largest Contentful Paint):

```javascript
// Check if LCP is triggered by an image
window.PerformanceMonitor.getMetrics().lcp.element
// Should be < 2.5s for good performance
```

### CDN Integration (Optional)

For production, consider using a CDN with automatic image optimization:

- **Cloudflare Images**: Automatic format conversion
- **ImageKit**: Real-time image optimization
- **Cloudinary**: Comprehensive image management

Example with Cloudinary:
```html
<img 
  src="https://res.cloudinary.com/gocloud/image/upload/f_auto,q_auto/hero.jpg"
  alt="Hero"
>
```

### Testing

```bash
# Start local server
npm start

# Run Lighthouse audit
npm run test:lighthouse

# Check image sizes
du -sh images/*

# Test on slow network
# Chrome DevTools → Network → Slow 3G
```

---

**Remember**: Every KB saved = Faster page load = Better user experience! 🚀
