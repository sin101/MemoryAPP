import { useEffect, useState } from 'react';
import CardGrid from './components/CardGrid';
import SuggestionsList from './components/SuggestionsList';

const defaultCards = [
  {
    id: '1',
    title: 'Sample Note',
    description: 'Demo card used for the UI prototype.',
    tags: ['demo', 'sample'],
  },
  {
    id: '2',
    title: 'JavaScript',
    description: 'Notes about JS.',
    tags: ['JavaScript', 'code'],
  },
];

export default function App() {
  const [cards, setCards] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let stored = [];
    try {
      stored = JSON.parse(localStorage.getItem('cards') || '[]');
    } catch {
      stored = [];
    }
    if (!stored.length) {
      stored = defaultCards;
      localStorage.setItem('cards', JSON.stringify(stored));
    }
    setCards(stored);
  }, []);

  const filtered = cards.filter(c => {
    const q = query.trim().toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-4">
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search cards..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="border p-2 w-full max-w-md"
        />
      </div>
      <CardGrid cards={filtered} onSelect={setSelected} />
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-2">Suggestions</h2>
        <SuggestionsList card={selected} />
      </div>
    </div>
  );
}
