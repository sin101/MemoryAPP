const Database = require('better-sqlite3');
const crypto = require('crypto');

class MemoryDB {
  constructor(path, key) {
    this.path = path;
    this.key = key;
    this.db = new Database(this.path);
    this.init();
    this.saveStmt = this.db.prepare(`INSERT OR REPLACE INTO cards (
      id, title, content, source, tags, decks, type, description,
      createdAt, summary, illustration
    ) VALUES (
      @id, @title, @content, @source, @tags, @decks, @type, @description,
      @createdAt, @summary, @illustration
    )`);
    this.deleteStmt = this.db.prepare('DELETE FROM cards WHERE id = ?');
    this.loadStmt = this.db.prepare('SELECT * FROM cards');
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
    )`;
    this.db.exec(sql);
  }

  saveCard(card) {
    this.saveStmt.run({
      id: card.id,
      title: this.encrypt(card.title),
      content: this.encrypt(card.content),
      source: this.encrypt(card.source),
      tags: this.encrypt(JSON.stringify(Array.from(card.tags))),
      decks: this.encrypt(JSON.stringify(Array.from(card.decks))),
      type: card.type,
      description: this.encrypt(card.description),
      createdAt: card.createdAt,
      summary: this.encrypt(card.summary || ''),
      illustration: this.encrypt(card.illustration || '')
    });
  }

  deleteCard(id) {
    this.deleteStmt.run(id);
  }

  loadCards() {
    const rows = this.loadStmt.all();
    return rows.map(r => ({
      id: r.id,
      title: this.decrypt(r.title),
      content: this.decrypt(r.content),
      tags: JSON.parse(this.decrypt(r.tags) || '[]'),
      decks: JSON.parse(this.decrypt(r.decks) || '[]'),
      type: r.type,
      description: this.decrypt(r.description),
      createdAt: r.createdAt,
      summary: this.decrypt(r.summary),
      illustration: this.decrypt(r.illustration),
      source: this.decrypt(r.source)
    }));
  }

  encrypt(text) {
    if (!this.key || text === undefined || text === null) return text;
    const cipher = crypto.createCipher('aes-256-ctr', this.key);
    return Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]).toString('hex');
  }

  decrypt(text) {
    if (!this.key || text === undefined || text === null) return text;
    const decipher = crypto.createDecipher('aes-256-ctr', this.key);
    try {
      return Buffer.concat([decipher.update(Buffer.from(String(text), 'hex')), decipher.final()]).toString('utf8');
    } catch {
      return '';
    }
  }

  close() {
    this.db.close();
  }
}

module.exports = MemoryDB;
