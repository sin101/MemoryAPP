import React, { useState } from 'react';

export default function Chatbot() {
  const [messages, setMessages] = useState([]);

  const handleSend = async e => {
    e.preventDefault();
    const text = e.target.elements.msg.value.trim();
    if (!text) return;
    setMessages(prev => [...prev, { from: 'user', text }]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { from: 'bot', text: data.reply || 'No response' }]);
    } catch {
      setMessages(prev => [...prev, { from: 'bot', text: 'Error contacting server.' }]);
    }
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
