import React, { useMemo, useState } from 'react';
import Fuse from 'fuse.js';

export default function Chatbot({ cards }) {
  const [messages, setMessages] = useState([]);
  const fuse = useMemo(() => new Fuse(cards, { keys: ['title', 'description', 'tags'], threshold: 0.3 }), [cards]);

  const handleSend = e => {
    e.preventDefault();
    const text = e.target.elements.msg.value.trim();
    if (!text) return;
    const results = fuse.search(text);
    let reply = "I couldn't find anything relevant.";
    if (results.length) {
      const card = results[0].item;
      reply = `Maybe you're looking for "${card.title}": ${card.description}`;
    }
    setMessages(prev => [...prev, { from: 'user', text }, { from: 'bot', text: reply }]);
    e.target.reset();
  };

  return (
    <div className="border p-2 h-64 flex flex-col">
      <div className="flex-1 overflow-y-auto mb-2">
        {messages.map((m, i) => (
          <div key={i} className={m.from === 'user' ? 'text-right' : 'text-left'}>
            <span className={m.from === 'user' ? 'inline-block bg-blue-200 p-1 rounded' : 'inline-block bg-gray-200 p-1 rounded'}>
              {m.text}
            </span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSend} className="flex space-x-1">
        <input name="msg" className="border flex-1 p-1" placeholder="Ask the bot..." />
        <button className="border px-2">Send</button>
      </form>
    </div>
  );
}
