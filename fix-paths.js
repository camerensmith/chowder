#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const BASE_PATH = '/';
const distDir = path.join(__dirname, 'dist');
const indexPath = path.join(distDir, 'index.html');
const nojekyllPath = path.join(distDir, '.nojekyll');
const swSourcePath = path.join(__dirname, 'public', 'sw.js');
const swDestPath = path.join(distDir, 'sw.js');

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
const expoPath = BASE_PATH === '/' ? '/_expo/' : `${BASE_PATH}/_expo/`;
html = html.replace(/src="\/_expo\//g, `src="${expoPath}`);
html = html.replace(/href="\/_expo\//g, `href="${expoPath}`);

// Fix manifest.json path if present
const manifestPath = BASE_PATH === '/' ? '/manifest.json' : `${BASE_PATH}/manifest.json`;
const manifestWebPath = BASE_PATH === '/' ? '/manifest.webmanifest' : `${BASE_PATH}/manifest.webmanifest`;
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
      const expoPath = BASE_PATH === '/' ? '/_expo/' : `${BASE_PATH}/_expo/`;
      const assetsPath = BASE_PATH === '/' ? '/assets/' : `${BASE_PATH}/assets/`;
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
const manifestPath = path.join(distDir, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // Fix start_url and scope if needed (handle root path correctly)
    if (manifest.start_url && !manifest.start_url.startsWith(BASE_PATH === '/' ? '/' : BASE_PATH)) {
      manifest.start_url = manifest.start_url === '/' ? '/' : (BASE_PATH === '/' ? manifest.start_url : `${BASE_PATH}${manifest.start_url}`);
    }
    if (manifest.scope && !manifest.scope.startsWith(BASE_PATH === '/' ? '/' : BASE_PATH)) {
      manifest.scope = manifest.scope === '/' ? '/' : (BASE_PATH === '/' ? manifest.scope : `${BASE_PATH}${manifest.scope}`);
    }
    // Fix icon paths (handle root path correctly)
    if (manifest.icons && Array.isArray(manifest.icons)) {
      manifest.icons = manifest.icons.map((icon) => {
        if (icon.src && icon.src.startsWith('/') && (BASE_PATH === '/' || !icon.src.startsWith(BASE_PATH))) {
          icon.src = BASE_PATH === '/' ? icon.src : `${BASE_PATH}${icon.src}`;
        }
        return icon;
      });
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
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
