import React, { useState } from 'react';

function luminance(hex) {
  const rgb = [0, 1, 2].map(i => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrastRatio(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function ColorRow({ label, id, value, onChange }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm cursor-pointer">
      <input id={id} type="color" value={value} onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded border border-gray-300 dark:border-gray-600 cursor-pointer p-0" />
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
    </label>
  );
}

export default function ThemeSettings({
  theme, setTheme,
  tagPalette, setTagPalette,
  cardBg, setCardBg,
  cardBorder, setCardBorder,
  accent, setAccent,
  textColor, setTextColor,
  font, setFont,
}) {
  const [tag, setTag] = useState('');
  const [color, setColor] = useState('#3b82f6');

  const contrast = contrastRatio(cardBg, textColor);
  const contrastPass = contrast >= 4.5;

  const addTagColor = () => {
    if (tag.trim()) {
      setTagPalette({ ...tagPalette, [tag.trim()]: color });
      setTag('');
    }
  };

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
      {/* Theme + Font */}
      <div className="flex items-center gap-3">
        <label htmlFor="theme-select" className="text-gray-600 dark:text-gray-400 shrink-0">Theme</label>
        <select id="theme-select" value={theme} onChange={e => setTheme(e.target.value)}
          className="border rounded px-2 py-1 text-sm">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="font-select" className="text-gray-600 dark:text-gray-400 shrink-0">Font</label>
        <select id="font-select" value={font} onChange={e => setFont(e.target.value)}
          className="border rounded px-2 py-1 text-sm">
          <option value="sans-serif">Sans</option>
          <option value="serif">Serif</option>
          <option value="monospace">Mono</option>
        </select>
      </div>

      {/* Colors */}
      <div className="flex items-center gap-4 flex-wrap">
        <ColorRow label="Card bg" id="card-bg" value={cardBg} onChange={setCardBg} />
        <ColorRow label="Border" id="card-border" value={cardBorder} onChange={setCardBorder} />
        <ColorRow label="Accent" id="accent-color" value={accent} onChange={setAccent} />
        <ColorRow label="Text" id="text-color" value={textColor} onChange={setTextColor} />
      </div>

      {/* Contrast */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 px-3 rounded border text-xs" style={{ backgroundColor: cardBg, color: textColor, borderColor: cardBorder }}>
          Preview
        </div>
        <span className={`text-xs ${contrastPass ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
          {contrast.toFixed(1)}:1 {contrastPass ? '✓' : '✗ WCAG'}
        </span>
      </div>

      {/* Tag colors */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          className="border rounded px-2 py-1 text-sm w-24"
          placeholder="Tag name"
          value={tag}
          onChange={e => setTag(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTagColor()}
        />
        <input type="color" value={color} onChange={e => setColor(e.target.value)}
          className="w-7 h-7 rounded border border-gray-300 dark:border-gray-600 cursor-pointer p-0" />
        <button
          onClick={addTagColor}
          className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-sm transition"
        >
          Add tag color
        </button>
        <div className="flex flex-wrap gap-1">
          {Object.entries(tagPalette).map(([t, c]) => (
            <span key={t} className="px-2 py-0.5 text-xs rounded-full font-medium" style={{ backgroundColor: c, color: '#fff' }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
