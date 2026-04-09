import React, { useEffect, useRef, useState } from 'react';

export default function Chatbot() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async e => {
    e.preventDefault();
    const text = e.target.elements.msg.value.trim();
    if (!text) return;
    setMessages(prev => [...prev, { from: 'user', text }]);
    setLoading(true);
    setError(null);
    e.target.reset();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { from: 'bot', text: data.answer || data.reply || 'No response' }]);
    } catch {
      setMessages(prev => [...prev, { from: 'bot', text: 'Error contacting server.' }]);
      setError('Error contacting server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 flex flex-col h-64">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center pt-4">Ask anything about your cards…</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <span className={`inline-block max-w-xs px-3 py-1.5 rounded-2xl text-sm leading-snug
              ${m.from === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-sm'
              }`}
            >
              {m.text}
            </span>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <span className="inline-block bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-3 py-1.5 rounded-2xl rounded-bl-sm text-sm">
              <span className="animate-pulse">Typing…</span>
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {error && <p className="text-red-500 text-xs px-3">{error}</p>}
      <form onSubmit={handleSend} className="flex gap-2 p-2 border-t border-gray-200 dark:border-gray-700">
        <input
          name="msg"
          className="border rounded-lg flex-1 px-3 py-1.5 text-sm"
          placeholder="Ask the bot…"
          aria-label="Chat message"
        />
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50"
          disabled={loading}
        >
          Send
        </button>
      </form>
    </div>
  );
}
