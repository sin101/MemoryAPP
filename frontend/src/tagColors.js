export const tagColor = tag => {
  const hash = Array.from(tag).reduce((h, c) => h + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return `hsl(${hue},70%,80%)`;
};
