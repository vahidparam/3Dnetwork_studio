import * as THREE from 'three';

const categoricalPalette = [
  '#5ea0ff', '#ff7b54', '#7ad48e', '#d67dff', '#ffcc66', '#4dd0e1', '#ff8fab', '#9ccc65', '#ffd166', '#8ecae6',
  '#c77dff', '#f4a261', '#80ed99', '#00b4d8', '#e76f51', '#6a4c93', '#43aa8b', '#f8961e', '#90be6d', '#577590'
];

export function hexToColor(hex, fallback = '#5ea0ff') {
  try {
    return new THREE.Color(hex || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

export function colorLuminance(color) {
  return (0.2126 * color.r) + (0.7152 * color.g) + (0.0722 * color.b);
}

export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function numericRamp(value, min, max, startHex = '#5ea0ff', endHex = '#ff7b54') {
  const t = clamp01((value - min) / ((max - min) || 1));
  const a = hexToColor(startHex);
  const b = hexToColor(endHex);
  return new THREE.Color(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t));
}

export function categoricalColor(value) {
  const str = String(value ?? 'missing');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hexToColor(categoricalPalette[Math.abs(hash) % categoricalPalette.length]);
}

export function parseLiteralColor(value) {
  if (value == null) return null;
  if (value instanceof THREE.Color) return value.clone();
  const str = String(value).trim();
  if (!str) return null;

  const csvRgbMatch = /^\s*(\d{1,3})\s*[,;\s]\s*(\d{1,3})\s*[,;\s]\s*(\d{1,3})(?:\s*[,;\s]\s*(\d*\.?\d+))?\s*$/i.exec(str);
  if (csvRgbMatch) {
    const [r, g, b] = csvRgbMatch.slice(1, 4).map((v) => Math.max(0, Math.min(255, Number(v))) / 255);
    return new THREE.Color(r, g, b);
  }

  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(str);
  const rgbMatch = /^rgba?\(([^)]+)\)$/i.test(str);
  const hslMatch = /^hsla?\(([^)]+)\)$/i.test(str);
  const namedMatch = /^[a-z]+$/i.test(str);
  const threeHexMatch = /^0x[0-9a-f]{6}$/i.test(str);
  if (!hexMatch && !rgbMatch && !hslMatch && !namedMatch && !threeHexMatch) return null;
  try {
    return new THREE.Color(str.replace(/^0x/i, '#'));
  } catch {
    return null;
  }
}

export function boostVisibility(color, amount = 0.14) {
  const fg = color instanceof THREE.Color ? color.clone() : hexToColor(color);
  const hsl = {};
  fg.getHSL(hsl);
  hsl.s = Math.min(1, hsl.s + amount * 0.45);
  hsl.l = Math.min(0.88, hsl.l + amount);
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

export function ensureContrast(color, background, threshold = 0.18) {
  const bg = background instanceof THREE.Color ? background.clone() : hexToColor(background);
  const fg = color instanceof THREE.Color ? color.clone() : hexToColor(color);
  const diff = Math.abs(colorLuminance(bg) - colorLuminance(fg));
  if (diff >= threshold) return fg;

  const bgIsDark = colorLuminance(bg) < 0.45;
  const hsl = {};
  fg.getHSL(hsl);
  if (bgIsDark) {
    hsl.l = Math.max(hsl.l + 0.22, 0.58);
    hsl.s = Math.max(hsl.s, 0.48);
  } else {
    hsl.l = Math.min(hsl.l - 0.24, 0.34);
    hsl.s = Math.max(hsl.s, 0.38);
  }
  const adjusted = new THREE.Color().setHSL(hsl.h, hsl.s, clamp01(hsl.l));
  if (Math.abs(colorLuminance(bg) - colorLuminance(adjusted)) >= threshold) return adjusted;
  return bgIsDark ? boostVisibility(fg, 0.26) : hexToColor('#1f57d6');
}
