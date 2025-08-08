import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import CardGrid from './components/CardGrid';
import SuggestionsList from './components/SuggestionsList';
import QuickAdd from './components/QuickAdd';
import DeckSidebar from './components/DeckSidebar';
import GraphView from './components/GraphView';
import Chatbot from './components/Chatbot';

const defaultCards = [
  {
    id: '1',
    title: 'Sample Note',
    description: 'Demo card used for the UI prototype.',
    tags: ['demo', 'sample'],
    decks: [],
  },
  {
    id: '2',
    title: 'JavaScript',
    description: 'Notes about JS.',
    tags: ['JavaScript', 'code'],
    decks: [],
  },
];

export default function App() {
  const [cards, setCards] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [deckFilter, setDeckFilter] = useState(null);
  const [showGraph, setShowGraph] = useState(false);
  const [quickAddInitial, setQuickAddInitial] = useState('');
  const [links, setLinks] = useState([]);
  const [webSuggestionsEnabled, setWebSuggestionsEnabled] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('webSuggestionsEnabled') || 'true');
    } catch {
      return true;
    }
  });

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
    stored = stored.map(c => {
      if (c.deck && !c.decks) {
        c.decks = [c.deck];
        delete c.deck;
      }
      c.decks = c.decks || [];
      return c;
    });
    setCards(stored);
  }, []);
  const fuse = useMemo(() => new Fuse(cards, { keys: ['title', 'description', 'tags'], threshold: 0.3 }), [cards]);
  const filtered = useMemo(() => {
    const base = query.trim() ? fuse.search(query.trim()).map(r => r.item) : cards;
    return base.filter(c => (deckFilter ? c.decks?.includes(deckFilter) : true));
  }, [cards, fuse, query, deckFilter]);

  const decks = cards.reduce((acc, c) => {
    (c.decks || []).forEach(d => {
      acc[d] = (acc[d] || 0) + 1;
    });
    return acc;
  }, {});

  const addCard = data => {
    const newCard = { id: String(Date.now()), tags: [], decks: [], ...data };
    setCards(prev => {
      const next = [...prev, newCard];
      localStorage.setItem('cards', JSON.stringify(next));
      return next;
    });
  };

  const editCard = card => {
    const title = prompt('Edit title', card.title);
    const decksStr = prompt(
      'Edit decks (comma separated)',
      (card.decks || []).join(',')
    );
    if (title !== null && decksStr !== null) {
      const decks = decksStr
        .split(',')
        .map(d => d.trim())
        .filter(Boolean);
      setCards(prev => {
        const next = prev.map(c =>
          c.id === card.id ? { ...c, title, decks } : c
        );
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
    addCard({
      ...card,
      id: 'fav-' + card.id,
      decks: [...(card.decks || []), 'favorites'],
    });
  };

  const handleSuggestionAdd = s => {
    addCard({
      title: s.title,
      description: s.description,
      tags: [s.tag || 'suggested'],
    });
  };

  const handleSuggestionEdit = s => {
    setQuickAddInitial(s.title);
  };

  const handleLinkCreate = (from, to) => {
    setLinks(prev => [...prev, { id: Date.now().toString(), from, to }]);
  };

  const toggleWebSuggestions = () => {
    setWebSuggestionsEnabled(prev => {
      const next = !prev;
      localStorage.setItem('webSuggestionsEnabled', JSON.stringify(next));
      return next;
    });
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
          <GraphView cards={cards} links={links} onLink={handleLinkCreate} />
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
          <h2 className="text-xl font-semibold mb-2 flex items-center">
            Suggestions
            <label className="ml-2 text-sm">
              <input
                type="checkbox"
                checked={webSuggestionsEnabled}
                onChange={toggleWebSuggestions}
                className="mr-1"
              />
              Enable web
            </label>
          </h2>
          <SuggestionsList
            card={selected}
            cards={cards}
            enabled={webSuggestionsEnabled}
            onAdd={handleSuggestionAdd}
            onEdit={handleSuggestionEdit}
          />
        </div>
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2">Chatbot</h2>
          <Chatbot cards={cards} />
        </div>
      </div>
    </div>
  );
}
