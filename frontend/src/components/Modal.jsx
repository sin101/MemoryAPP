import React, { useEffect } from 'react';

export default function Modal({ title, children, onClose }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white dark:bg-gray-800 p-4 rounded shadow max-w-sm w-full">
        <div className="flex justify-between items-center mb-2">
          <h2 id="modal-title" className="text-lg">
            {title}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-xl">
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

