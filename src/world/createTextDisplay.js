import * as THREE from 'three';

export function createTextDisplay({ width = 512, height = 256, background = '#f4f0e6', color = '#171811' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  let lastText = null;

  function setText(value, caption = '') {
    const text = String(value);
    const cacheKey = `${caption}\n${text}`;
    if (cacheKey === lastText) return;
    lastText = cacheKey;

    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = color;
    context.lineWidth = 14;
    context.strokeRect(7, 7, width - 14, height - 14);
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if (caption) {
      context.font = '600 34px sans-serif';
      context.fillText(caption.toUpperCase(), width / 2, 53);
    }
    drawFittedText(context, text, width - 58, caption ? 152 : height - 46, caption ? 154 : height / 2);
    texture.needsUpdate = true;
  }

  return { texture, setText };
}

export function formatElapsed(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function drawFittedText(context, text, maxWidth, maxHeight, centerY) {
  const lines = wrapLines(context, text || ' ', maxWidth, 2);
  let fontSize = Math.min(94, maxHeight / lines.length);
  do {
    context.font = `700 ${fontSize}px sans-serif`;
    if (lines.every((line) => context.measureText(line).width <= maxWidth)) break;
    fontSize -= 2;
  } while (fontSize > 20);
  const lineHeight = fontSize * 1.05;
  const firstY = centerY - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => context.fillText(line, context.canvas.width / 2, firstY + index * lineHeight));
}

function wrapLines(context, text, maxWidth, maxLines) {
  context.font = '700 94px sans-serif';
  const words = text.trim().split(/\s+/);
  const lines = [];
  for (const word of words) {
    const candidate = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && context.measureText(candidate).width > maxWidth && lines.length < maxLines) lines.push(word);
    else if (lines.length) lines[lines.length - 1] = candidate;
    else lines.push(word);
  }
  return lines.slice(0, maxLines);
}
