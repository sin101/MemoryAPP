import React, { useState } from 'react';
import Modal from './Modal';

export default function EditCardModal({ card, onSave, onClose }) {
  const [title, setTitle] = useState(card.title || '');
  const [description, setDescription] = useState(card.description || '');
  const [tags, setTags] = useState((card.tags || []).join(', '));
  const [decks, setDecks] = useState((card.decks || []).join(', '));
  const [content, setContent] = useState(card.content || '');

  const handleSubmit = e => {
    e.preventDefault();
    onSave({
      ...card,
      title,
      description,
      content,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      decks: decks.split(',').map(d => d.trim()).filter(Boolean),
    });
  };

  return (
    <Modal title="Edit Card" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="block text-sm font-medium mb-1">Title</span>
          <input
            className="border px-2 py-1 w-full bg-white dark:bg-gray-700"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium mb-1">Description</span>
          <textarea
            className="border px-2 py-1 w-full bg-white dark:bg-gray-700"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium mb-1">Content</span>
          <textarea
            className="border px-2 py-1 w-full bg-white dark:bg-gray-700"
            rows={3}
            value={content}
            onChange={e => setContent(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium mb-1">Tags (comma separated)</span>
          <input
            className="border px-2 py-1 w-full bg-white dark:bg-gray-700"
            value={tags}
            onChange={e => setTags(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium mb-1">Decks (comma separated)</span>
          <input
            className="border px-2 py-1 w-full bg-white dark:bg-gray-700"
            value={decks}
            onChange={e => setDecks(e.target.value)}
          />
        </label>
        <div className="flex justify-end space-x-2 pt-2">
          <button type="button" className="border px-3 py-1" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="bg-blue-500 text-white px-3 py-1">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
