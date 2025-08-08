import { useEffect, useState } from 'react';
import CardGrid from './components/CardGrid';
import SuggestionsList from './components/SuggestionsList';
import QuickAdd from './components/QuickAdd';
import DeckSidebar from './components/DeckSidebar';
import GraphView from './components/GraphView';

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
  const [deckFilter, setDeckFilter] = useState(null);
  const [showGraph, setShowGraph] = useState(false);
  const [quickAddInitial, setQuickAddInitial] = useState('');

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
    const matchesQuery =
      c.title.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q));
    const matchesDeck = deckFilter ? c.deck === deckFilter : true;
    return matchesQuery && matchesDeck;
  });

  const decks = Array.from(new Set(cards.map(c => c.deck).filter(Boolean)));

  const addCard = data => {
    const newCard = { id: String(Date.now()), tags: [], ...data };
    setCards(prev => {
      const next = [...prev, newCard];
      localStorage.setItem('cards', JSON.stringify(next));
      return next;
    });
  };

  const editCard = card => {
    const title = prompt('Edit title', card.title);
    if (title) {
      setCards(prev => {
        const next = prev.map(c => (c.id === card.id ? { ...c, title } : c));
        localStorage.setItem('cards', JSON.stringify(next));
        return next;
      });
    }
  };

  const deleteCard = id => {
    setCards(prev => {
      const next = prev.filter(c => c.id !== id);
      localStorage.setItem('cards', JSON.stringify(next));
      return next;
    });
  };

  const favCard = card => {
    addCard({ ...card, id: 'fav-' + card.id, deck: 'favorites' });
  };

  const handleSuggestionAdd = s => {
    addCard({ title: s.title, description: s.description, tags: [s.tag || 'suggested'] });
  };

  const handleSuggestionEdit = s => {
    setQuickAddInitial(s.title);
  };

  return (
    <div className="flex">
      <DeckSidebar decks={decks} current={deckFilter} onSelect={setDeckFilter} />
      <div className="p-4 flex-1">
        <div className="mb-4 flex items-center space-x-2">
          <input
            type="text"
            placeholder="Search cards..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="border p-2 flex-1 max-w-md"
          />
          <button className="border px-2" onClick={() => setShowGraph(g => !g)}>Graph</button>
        </div>
        <QuickAdd onAdd={addCard} initial={quickAddInitial} />
        {showGraph ? (
          <GraphView cards={cards} links={[]} />
        ) : (
          <CardGrid
            cards={filtered}
            onSelect={setSelected}
            onEdit={editCard}
            onDelete={deleteCard}
            onFav={favCard}
          />
        )}
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2">Suggestions</h2>
          <SuggestionsList card={selected} onAdd={handleSuggestionAdd} onEdit={handleSuggestionEdit} />
        </div>
      </div>
    </div>
  );
}
