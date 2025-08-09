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
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}

export default function ThemeSettings({
  theme,
  setTheme,
  tagPalette,
  setTagPalette,
  cardBg,
  setCardBg,
  cardBorder,
  setCardBorder,
  accent,
  setAccent,
  textColor,
  setTextColor,
  font,
  setFont,
}) {
  const [tag, setTag] = useState('');
  const [color, setColor] = useState('#ff0000');

  const contrast = contrastRatio(cardBg, textColor);
  const contrastPass = contrast >= 4.5;

  const addTagColor = () => {
    if (tag) {
      setTagPalette({ ...tagPalette, [tag]: color });
      setTag('');
    }
  };

  return (
    <div className="border p-2 mb-4">
      <div className="flex items-center space-x-2 mb-2">
        <label htmlFor="theme-select">Theme:</label>
        <select
          id="theme-select"
          value={theme}
          onChange={e => setTheme(e.target.value)}
          className="border px-2"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div className="flex items-center space-x-2 mb-2">
        <label htmlFor="card-bg">Card bg:</label>
        <input id="card-bg" type="color" value={cardBg} onChange={e => setCardBg(e.target.value)} />
        <label htmlFor="card-border">Border:</label>
        <input id="card-border" type="color" value={cardBorder} onChange={e => setCardBorder(e.target.value)} />
      </div>
      <div className="flex items-center space-x-2 mb-2">
        <label htmlFor="accent-color">Accent:</label>
        <input id="accent-color" type="color" value={accent} onChange={e => setAccent(e.target.value)} />
        <label htmlFor="text-color">Text:</label>
        <input id="text-color" type="color" value={textColor} onChange={e => setTextColor(e.target.value)} />
        <label htmlFor="font-select">Font:</label>
        <select id="font-select" value={font} onChange={e => setFont(e.target.value)} className="border px-2">
          <option value="sans-serif">Sans</option>
          <option value="serif">Serif</option>
          <option value="monospace">Mono</option>
        </select>
      </div>
      <div className="mb-2">
        <p className={`text-sm ${contrastPass ? 'text-green-600' : 'text-red-600'}`}>
          Contrast ratio {contrast.toFixed(2)} {contrastPass ? 'passes' : 'fails'} WCAG 4.5:1
        </p>
        <div
          className="mt-1 p-2 rounded border"
          style={{ backgroundColor: cardBg, color: textColor, borderColor: cardBorder }}
        >
          Preview text
        </div>
      </div>
      <div className="flex items-center space-x-2 mb-2">
        <label htmlFor="tag-name" className="sr-only">Tag</label>
        <input
          id="tag-name"
          className="border p-1"
          placeholder="Tag"
          value={tag}
          onChange={e => setTag(e.target.value)}
        />
        <label htmlFor="tag-color" className="sr-only">Color</label>
        <input id="tag-color" type="color" value={color} onChange={e => setColor(e.target.value)} />
        <button className="bg-blue-500 text-white px-2" onClick={addTagColor}>
          Add
        </button>
      </div>
      <div className="flex flex-wrap">
        {Object.entries(tagPalette).map(([t, c]) => (
          <span
            key={t}
            className="px-2 py-1 text-xs rounded mr-1 mb-1"
            style={{ backgroundColor: c }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
