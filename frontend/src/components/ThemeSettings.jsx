import React, { useState } from 'react';

export default function ThemeSettings({
  theme,
  setTheme,
  tagPalette,
  setTagPalette,
  cardBg,
  setCardBg,
  cardBorder,
  setCardBorder,
}) {
  const [tag, setTag] = useState('');
  const [color, setColor] = useState('#ff0000');

  const addTagColor = () => {
    if (tag) {
      setTagPalette({ ...tagPalette, [tag]: color });
      setTag('');
    }
  };

  return (
    <div className="border p-2 mb-4">
      <div className="flex items-center space-x-2 mb-2">
        <label>Theme:</label>
        <select
          value={theme}
          onChange={e => setTheme(e.target.value)}
          className="border px-2"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div className="flex items-center space-x-2 mb-2">
        <label>Card bg:</label>
        <input type="color" value={cardBg} onChange={e => setCardBg(e.target.value)} />
        <label>Border:</label>
        <input type="color" value={cardBorder} onChange={e => setCardBorder(e.target.value)} />
      </div>
      <div className="flex items-center space-x-2 mb-2">
        <input
          className="border p-1"
          placeholder="Tag"
          value={tag}
          onChange={e => setTag(e.target.value)}
        />
        <input type="color" value={color} onChange={e => setColor(e.target.value)} />
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
