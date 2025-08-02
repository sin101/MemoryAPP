const Database = require('better-sqlite3');

class MemoryDB {
  constructor(path) {
    this.path = path;
    this.db = new Database(path);
    this.init();
  }

  init() {
    const sql = `CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT,
      source TEXT,
      tags TEXT,
      decks TEXT,
      type TEXT,
      description TEXT,
      createdAt TEXT,
      summary TEXT,
      illustration TEXT
    );`;
    this.db.prepare(sql).run();
  }

  saveCard(card) {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO cards (id,title,content,source,tags,decks,type,description,createdAt,summary,illustration)
       VALUES (@id,@title,@content,@source,@tags,@decks,@type,@description,@createdAt,@summary,@illustration)`
    );
    stmt.run({
      id: card.id,
      title: card.title,
      content: card.content,
      source: card.source,
      tags: JSON.stringify(Array.from(card.tags)),
      decks: JSON.stringify(Array.from(card.decks)),
      type: card.type,
      description: card.description,
      createdAt: card.createdAt,
      summary: card.summary || '',
      illustration: card.illustration || ''
    });
  }

  deleteCard(id) {
    this.db.prepare('DELETE FROM cards WHERE id = ?').run(id);
  }

  loadCards() {
    const rows = this.db.prepare('SELECT * FROM cards').all();
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      tags: JSON.parse(r.tags || '[]'),
      decks: JSON.parse(r.decks || '[]'),
      type: r.type,
      description: r.description,
      createdAt: r.createdAt,
      summary: r.summary,
      illustration: r.illustration,
      source: r.source
    }));
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = MemoryDB;
