#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const BASE_PATH = '/chowder';
const distDir = path.join(__dirname, 'dist');
const indexPath = path.join(distDir, 'index.html');
const nojekyllPath = path.join(distDir, '.nojekyll');

// Read the index.html file
let html = fs.readFileSync(indexPath, 'utf8');

// Replace absolute paths with base path
html = html.replace(/src="\/_expo\//g, `src="${BASE_PATH}/_expo/`);
html = html.replace(/href="\/_expo\//g, `href="${BASE_PATH}/_expo/`);

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
      
      // Replace absolute paths to assets and expo
      const modified = content
        .replace(/"\/_expo\//g, `"${BASE_PATH}/_expo/`)
        .replace(/"\/assets\//g, `"${BASE_PATH}/assets/`);
      
      if (content !== modified) {
        fs.writeFileSync(filePath, modified, 'utf8');
        count++;
      }
    }
  });
  
  return count;
}

const jsCount = fixJsFiles(path.join(distDir, '_expo'));

// Create .nojekyll file to prevent GitHub Pages from processing files
fs.writeFileSync(nojekyllPath, '', 'utf8');

console.log('✅ Fixed paths in index.html for GitHub Pages deployment');
console.log(`✅ Fixed paths in ${jsCount} JavaScript files`);
console.log('✅ Created .nojekyll file');
