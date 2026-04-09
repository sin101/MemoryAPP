import React, { useState } from 'react';
import Modal from './Modal';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'border rounded-lg px-3 py-2 w-full text-sm transition';

export default function EditCardModal({ card, onSave, onClose }) {
  const [title, setTitle]       = useState(card.title || '');
  const [description, setDescription] = useState(card.description || '');
  const [tags, setTags]         = useState((card.tags || []).join(', '));
  const [decks, setDecks]       = useState((card.decks || []).join(', '));
  const [content, setContent]   = useState(card.content || '');

  const handleSubmit = e => {
    e.preventDefault();
    onSave({
      ...card,
      title,
      description,
      content,
      tags:  tags.split(',').map(t => t.trim()).filter(Boolean),
      decks: decks.split(',').map(d => d.trim()).filter(Boolean),
    });
  };

  return (
    <Modal title="Edit card" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Title">
          <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Description">
          <textarea className={inputCls} rows={3} value={description} onChange={e => setDescription(e.target.value)} />
        </Field>
        <Field label="Content">
          <textarea className={inputCls} rows={3} value={content} onChange={e => setContent(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tags (comma separated)">
            <input className={inputCls} value={tags} onChange={e => setTags(e.target.value)} placeholder="tag1, tag2" />
          </Field>
          <Field label="Decks (comma separated)">
            <input className={inputCls} value={decks} onChange={e => setDecks(e.target.value)} placeholder="deck1, deck2" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
