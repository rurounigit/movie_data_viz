// js/utils.js
import * as config from './config.js';

let generatedGroupColorsCache = {};
let lastHue = Math.random() * 360;

export function htmlEscape(str) {
    if (!str) return '';
   return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function getTextColorForBackground(hexColor) {
    if (!hexColor) return '#e0e0e0'; // Default text color if no background
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const brightness = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    return brightness > 127.5 ? '#000000' : '#FFFFFF';
}

export function createTooltipElement(text, backgroundColor) {
    const tooltipContent = document.createElement('div');
    const textColor = getTextColorForBackground(backgroundColor);
    tooltipContent.style.backgroundColor = backgroundColor || '#2c313a'; // Default background
    tooltipContent.style.color = textColor;
    tooltipContent.style.padding = '10px';
    tooltipContent.style.borderRadius = '8px';
    tooltipContent.style.whiteSpace = 'pre-wrap'; // Important for newlines in tooltip
    tooltipContent.innerText = text || '';
    return tooltipContent;
}

export function getEdgeWidth(strength) {
    if (strength === 5) return 25;
    if (strength === 4) return 15;
    if (strength === 3) return 6;
    if (strength === 2) return 2;
    return 1; // Default for strength 1 or undefined
}

export function calculateNodeFontSize(degree) {
    return Math.min(config.minNodeLabelSize + (degree * config.nodeLabelDegreeScaleFactor), config.maxNodeLabelSize);
}

export function calculateEdgeFontSize(strength) {
    return Math.min(config.minEdgeLabelSize + ((strength - 1) * config.edgeLabelStrengthScaleFactor), config.maxEdgeLabelSize);
}

export function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function generateAndCacheGroupColor(groupName) {
    if (generatedGroupColorsCache[groupName]) {
        return generatedGroupColorsCache[groupName];
    }
    if (groupName === 'Unknown') {
        return generatedGroupColorsCache[groupName] = '#bdbdbd'; // Specific color for 'Unknown'
    }

    let newColorHex;
    let attempts = 0;
    do {
        lastHue = (lastHue + config.HUE_INCREMENT) % 360;
        newColorHex = hslToHex(lastHue, config.FIXED_GROUP_SATURATION, config.FIXED_GROUP_LIGHTNESS);
        attempts++;
    } while (config.SENTIMENT_COLORS_HEX.includes(newColorHex.toLowerCase()) && attempts < 20); // Avoid collision with sentiment colors

    if (attempts >= 20) {
        console.warn(`Could not generate a distinct color for group "${groupName}" after ${attempts} attempts. Using a random fallback.`);
        // Fallback to a completely random color if too many collisions occur
        newColorHex = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    }

    generatedGroupColorsCache[groupName] = newColorHex;
    return newColorHex;
}

export function getGeneratedGroupColorsCache() {
    return generatedGroupColorsCache;
}

export function slugify(text) {
    if (!text) return "unknown";
    return String(text)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except space and hyphen
        .replace(/[\s_-]+/g, '-')     // Replace spaces, underscores, hyphens with a single hyphen
        .replace(/^-+|-+$/g, '')      // Remove leading/trailing hyphens
        || "slug_error";              // Fallback if empty after processing
}

export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}