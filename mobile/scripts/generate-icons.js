const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const BRAND_COLOR = '#4F46E5';
const WHITE = '#FFFFFF';

// Draw a stylized "A" using paths for consistent rendering
function drawStylizedA(ctx, centerX, centerY, size, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  
  const height = size;
  const width = size * 0.85;
  const strokeWidth = size * 0.15;
  
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const top = centerY - height / 2;
  const bottom = centerY + height / 2;
  
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // Draw the "A" shape using lines
  ctx.beginPath();
  
  // Left leg
  ctx.moveTo(left, bottom);
  ctx.lineTo(centerX, top);
  
  // Right leg
  ctx.lineTo(right, bottom);
  
  ctx.stroke();
  
  // Crossbar
  const crossbarY = centerY + height * 0.1;
  const crossbarInset = width * 0.2;
  
  ctx.beginPath();
  ctx.moveTo(left + crossbarInset, crossbarY);
  ctx.lineTo(right - crossbarInset, crossbarY);
  ctx.stroke();
}

function generateIcon(size, filename, options = {}) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  const { 
    isAdaptive = false, 
    isFavicon = false,
    isSplash = false 
  } = options;

  // Background
  if (isAdaptive) {
    // Transparent background for adaptive icon
    ctx.clearRect(0, 0, size, size);
  } else {
    // Solid brand color background
    ctx.fillStyle = BRAND_COLOR;
    ctx.fillRect(0, 0, size, size);
  }

  // Calculate "A" size based on canvas
  let aSize;
  if (isFavicon) {
    aSize = size * 0.6;
  } else if (isSplash) {
    aSize = size * 0.5;
  } else {
    aSize = size * 0.55;
  }
  
  const color = isAdaptive ? BRAND_COLOR : WHITE;
  drawStylizedA(ctx, size / 2, size / 2, aSize, color);

  // Save to file
  const buffer = canvas.toBuffer('image/png');
  const outputPath = path.join(__dirname, '..', 'assets', filename);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated: ${filename} (${size}x${size})`);
}

// Generate all icon variants
console.log('Generating Type A icons with brand color:', BRAND_COLOR);
console.log('');

// Main app icon (1024x1024)
generateIcon(1024, 'icon.png');

// Android adaptive icon foreground (1024x1024)
generateIcon(1024, 'adaptive-icon.png', { isAdaptive: true });

// Favicon for web (48x48)
generateIcon(48, 'favicon.png', { isFavicon: true });

// Splash icon (200x200)
generateIcon(200, 'splash-icon.png', { isSplash: true });

console.log('');
console.log('All icons generated successfully!');
