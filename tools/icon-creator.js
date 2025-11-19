const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const { colorMap } = require('./color-map');

function getColorForIcon(filename) {
  // Remove file extension
  const name = path.parse(filename).name;

  // Try exact match first
  if (colorMap[name]) {
    return colorMap[name];
  }

  // Try case-insensitive match
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(colorMap)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }

  // Default to white if no match found
  return '#FFFFFF';
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function getLuminance(r, g, b) {
  // Convert RGB to relative luminance using WCAG formula
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(color1, color2) {
  const lum1 = getLuminance(color1.r, color1.g, color1.b);
  const lum2 = getLuminance(color2.r, color2.g, color2.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

function shouldUseBlackIcon(backgroundColor) {
  const bgColor = hexToRgb(backgroundColor);
  const whiteColor = { r: 255, g: 255, b: 255 };

  // Calculate contrast ratio between white icon and background
  const contrastRatio = getContrastRatio(whiteColor, bgColor);

  // WCAG recommends minimum 3:1 for large text/icons
  // Use black icon if contrast is insufficient
  return contrastRatio < 2;
}

async function processIcons(iconsPath) {
  const defaultDir = path.join(iconsPath, 'Default');
  const activeDir = path.join(iconsPath, 'Active');

  // Create output directories
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  if (!fs.existsSync(activeDir)) {
    fs.mkdirSync(activeDir, { recursive: true });
  }

  // Get all PNG files in the icons directory
  const files = fs
    .readdirSync(iconsPath)
    .filter((file) => path.extname(file).toLowerCase() === '.png')
    .filter((file) => fs.statSync(path.join(iconsPath, file)).isFile());

  console.log(`Found ${files.length} icon files to process...`);

  for (const file of files) {
    const iconPath = path.join(iconsPath, file);
    const color = getColorForIcon(file);

    console.log(`Processing ${file} with color ${color}...`);

    try {
      // Create default icon (recolored)
      const defaultCanvas = await createDefaultIcon(iconPath, color);
      const defaultOutput = path.join(defaultDir, file);
      const defaultBuffer = defaultCanvas.toBuffer('image/png');
      fs.writeFileSync(defaultOutput, defaultBuffer);

      // Create active icon (white icon in colored circle)
      const activeCanvas = await createActiveIcon(iconPath, color);
      const activeOutput = path.join(activeDir, file);
      const activeBuffer = activeCanvas.toBuffer('image/png');
      fs.writeFileSync(activeOutput, activeBuffer);

      console.log(`✓ Created ${file}`);
    } catch (error) {
      console.error(`✗ Error processing ${file}:`, error.message);
    }
  }

  console.log('Processing complete!');
}

function resizeIconToFit(originalImage, maxWidth = 256, maxHeight = 256) {
  const originalWidth = originalImage.width;
  const originalHeight = originalImage.height;

  // If already the right size, return as-is
  if (originalWidth === maxWidth && originalHeight === maxHeight) {
    return originalImage;
  }

  // Calculate scaling factor to fit within bounds while maintaining aspect ratio
  const scaleX = maxWidth / originalWidth;
  const scaleY = maxHeight / originalHeight;
  const scale = Math.min(scaleX, scaleY);

  const newWidth = Math.round(originalWidth * scale);
  const newHeight = Math.round(originalHeight * scale);

  // Create a new canvas with the resized image
  const canvas = createCanvas(newWidth, newHeight);
  const ctx = canvas.getContext('2d');

  // Use high-quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(originalImage, 0, 0, newWidth, newHeight);

  return canvas;
}

function recolorIcon(originalImage, color) {
  // First resize the image to fit within 256x256
  const resizedImage = resizeIconToFit(originalImage, 256, 256);

  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');

  // Center the resized image in the 256x256 canvas
  const offsetX = (256 - resizedImage.width) / 2;
  const offsetY = (256 - resizedImage.height) / 2;

  // Draw the resized image centered
  ctx.drawImage(resizedImage, offsetX, offsetY);

  // Apply color overlay using composite operation
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);

  return canvas;
}

async function createDefaultIcon(iconPath, color) {
  const canvas = createCanvas(384, 384);
  const ctx = canvas.getContext('2d');

  // Load and recolor the original icon
  const originalImage = await loadImage(iconPath);
  const recoloredIcon = recolorIcon(originalImage, color);

  // Center the 256x256 icon in the 384x384 canvas
  const offsetX = (384 - 256) / 2;
  const offsetY = (384 - 256) / 2;

  ctx.drawImage(recoloredIcon, offsetX, offsetY);

  return canvas;
}

async function createActiveIcon(iconPath, color) {
  const canvas = createCanvas(384, 384);
  const ctx = canvas.getContext('2d');

  // Draw colored circle
  const centerX = 192;
  const centerY = 192;
  const radius = 192;

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();

  // Load and resize the original icon
  const originalImage = await loadImage(iconPath);
  const resizedImage = resizeIconToFit(originalImage, 256, 256);

  // Calculate centering within the 384x384 canvas
  const iconX = (384 - resizedImage.width) / 2;
  const iconY = (384 - resizedImage.height) / 2;

  // Check if we need to use black icon for better contrast
  if (shouldUseBlackIcon(color)) {
    // Recolor the resized icon to black
    const blackIcon = recolorIcon(originalImage, '#000000');
    ctx.drawImage(blackIcon, 64, 64); // Center the 256x256 recolored icon
  } else {
    // Use the original resized icon (white)
    ctx.drawImage(resizedImage, iconX, iconY);
  }

  return canvas;
}

// Main execution
if (process.argv.length < 3) {
  console.log('Usage: node script.js <path-to-icons-directory>');
  process.exit(1);
}

const iconsPath = process.argv[2];

if (!fs.existsSync(iconsPath)) {
  console.error('Error: Icons directory does not exist:', iconsPath);
  process.exit(1);
}

processIcons(iconsPath).catch(console.error);
