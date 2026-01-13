#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const normalizeBasePath = (value = '/') => {
  if (!value || value === '/') return '/';
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '/';
};

const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || '/');
const distDir = path.join(__dirname, 'dist');
const indexPath = path.join(distDir, 'index.html');
const nojekyllPath = path.join(distDir, '.nojekyll');
const swSourcePath = path.join(__dirname, 'public', 'sw.js');
const swDestPath = path.join(distDir, 'sw.js');

const withBasePath = (pathname) => {
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
    // Fix start_url and scope to match the deployment base path
    manifest.start_url = withBasePath('/');
    manifest.scope = withBasePath('/');
    // Fix icon paths (handle root path correctly)
    if (manifest.icons && Array.isArray(manifest.icons)) {
      const prefixIconSrc = (src) => {
        if (!src || !src.startsWith('/')) return src;
        return withBasePath(src);
      };
      manifest.icons = manifest.icons.map((icon) => {
        icon.src = prefixIconSrc(icon.src);
        return icon;
      });
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
