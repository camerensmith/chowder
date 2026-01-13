#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const normalizeBasePath = (value = '/') => {
  if (!value || value === '/') return '/';
  // Normalize any repeated leading/trailing slashes that may come from env input
  const trimmed = value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed ? `/${trimmed}` : '/';
};

const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || '/');
const distDir = path.join(__dirname, 'dist');
const indexPath = path.join(distDir, 'index.html');
const nojekyllPath = path.join(distDir, '.nojekyll');
const swSourcePath = path.join(__dirname, 'public', 'sw.js');
const swDestPath = path.join(distDir, 'sw.js');

const withBasePath = (pathname) => {
  if (!pathname) {
    return BASE_PATH === '/' ? '/' : BASE_PATH;
  }
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (BASE_PATH === '/') {
    return normalizedPath;
  }
  if (normalizedPath.startsWith(BASE_PATH)) {
    return normalizedPath;
  }
  return `${BASE_PATH}${normalizedPath}`;
};

// Copy service worker to dist directory
if (fs.existsSync(swSourcePath)) {
  fs.copyFileSync(swSourcePath, swDestPath);
  console.log('✅ Copied service worker to dist directory');
} else {
  console.warn('⚠️  Service worker source not found at:', swSourcePath);
}

// Read the index.html file
let html = fs.readFileSync(indexPath, 'utf8');

// Replace absolute paths with base path (handle root path correctly)
const expoPath = withBasePath('/_expo/');
html = html.replace(/src="\/_expo\//g, `src="${expoPath}`);
html = html.replace(/href="\/_expo\//g, `href="${expoPath}`);

// Fix manifest.json path if present
const manifestPath = withBasePath('/manifest.json');
const manifestWebPath = withBasePath('/manifest.webmanifest');
html = html.replace(/href="\/manifest\.json"/g, `href="${manifestPath}"`);
html = html.replace(/href="\/manifest\.webmanifest"/g, `href="${manifestWebPath}"`);

// Ensure favicon link tags are present with correct base path
const faviconPath = withBasePath('/assets/appicon.png');
const appleTouchIconPath = withBasePath('/assets/appicon.png');

// Remove existing favicon/apple-touch-icon links
html = html.replace(/<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>/gi, '');

// Add favicon and apple-touch-icon links in the head section
if (html.includes('</head>')) {
  const faviconLinks = `\n    <link rel="icon" type="image/png" href="${faviconPath}" />\n    <link rel="apple-touch-icon" href="${appleTouchIconPath}" />`;
  html = html.replace('</head>', `${faviconLinks}\n  </head>`);
} else if (html.includes('<head>')) {
  const faviconLinks = `\n    <link rel="icon" type="image/png" href="${faviconPath}" />\n    <link rel="apple-touch-icon" href="${appleTouchIconPath}" />`;
  html = html.replace('<head>', `<head>${faviconLinks}`);
}

// Write the modified HTML back
fs.writeFileSync(indexPath, html, 'utf8');

// Fix paths in JavaScript bundles
function fixJsFiles(dir) {
  const files = fs.readdirSync(dir);
  let count = 0;
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      count += fixJsFiles(filePath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Replace absolute paths to assets and expo (handle root path correctly)
      const expoPath = withBasePath('/_expo/');
      const assetsPath = withBasePath('/assets/');
      const modified = content
        .replace(/"\/_expo\//g, `"${expoPath}`)
        .replace(/"\/assets\//g, `"${assetsPath}`);
      
      if (content !== modified) {
        fs.writeFileSync(filePath, modified, 'utf8');
        count++;
      }
    }
  });
  
  return count;
}

const jsCount = fixJsFiles(path.join(distDir, '_expo'));

// Fix manifest.json if it exists
const manifestFilePath = path.join(distDir, 'manifest.json');
if (fs.existsSync(manifestFilePath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFilePath, 'utf8'));
    const normalizeUrlForBase = (value, fallback = '/') => {
      const rawValue = value || fallback;
      const normalized = rawValue.startsWith('/') ? rawValue : `/${rawValue}`;
      if (BASE_PATH === '/') return normalized;
      return normalized.startsWith(BASE_PATH) ? normalized : withBasePath(normalized);
    };
    // Fix start_url and scope to match the deployment base path
    const updatedStartUrl = normalizeUrlForBase(manifest.start_url);
    if (manifest.start_url !== updatedStartUrl) {
      manifest.start_url = updatedStartUrl;
    }
    const updatedScope = normalizeUrlForBase(manifest.scope);
    if (manifest.scope !== updatedScope) {
      manifest.scope = updatedScope;
    }
    // Fix icon paths and ensure appicon.png is used
    const appiconPath = withBasePath('/assets/appicon.png');
    if (manifest.icons && Array.isArray(manifest.icons)) {
      // Update all icon paths to use base path
      manifest.icons = manifest.icons.map((icon) => {
        if (icon.src && icon.src.startsWith('/')) {
          icon.src = withBasePath(icon.src);
        }
        // If the icon path contains 'favicon' or 'icon', replace with appicon
        if (icon.src && (icon.src.includes('favicon') || icon.src.includes('icon.png'))) {
          icon.src = appiconPath;
        }
        return icon;
      });
    } else {
      // If no icons array exists, create one with appicon.png
      manifest.icons = [
        {
          src: appiconPath,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: appiconPath,
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: appiconPath,
          sizes: '144x144',
          type: 'image/png'
        }
      ];
    }
    fs.writeFileSync(manifestFilePath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log('✅ Fixed paths in manifest.json');
  } catch (err) {
    console.warn('⚠️  Could not parse manifest.json:', err);
  }
}

// Create .nojekyll file to prevent GitHub Pages from processing files
fs.writeFileSync(nojekyllPath, '', 'utf8');

console.log('✅ Fixed paths in index.html for GitHub Pages deployment');
console.log(`✅ Fixed paths in ${jsCount} JavaScript files`);
console.log('✅ Created .nojekyll file');
console.log('✅ PWA assets configured for GitHub Pages');
console.log(`✅ Using base path: ${BASE_PATH}`);
