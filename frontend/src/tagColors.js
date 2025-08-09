import { get } from 'idb-keyval';

let storedPalette = {};
get('tagPalette').then(p => {
  if (p) storedPalette = p;
});

export const setTagPaletteCache = p => {
  storedPalette = p || {};
};

const defaultColor = tag => {
  const hash = Array.from(tag).reduce((h, c) => h + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return `hsl(${hue},70%,80%)`;
};

export const tagColor = (tag, palette) => {
  const pal = palette || storedPalette;
  return pal[tag] || defaultColor(tag);
};
