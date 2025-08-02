const { spawnSync } = require('child_process');
const fs = require('fs');

function runSql(dbPath, sql, opts = []) {
  const result = spawnSync('sqlite3', [...opts, dbPath], { input: sql });
  if (result.status !== 0) {
    throw new Error(result.stderr.toString());
  }
  return result.stdout.toString();
}

function esc(value) {
  return String(value).replace(/'/g, "''");
}

class MemoryDB {
  constructor(path) {
    this.path = path;
    this.init();
  }

  init() {
    const sql = `CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT,
      tags TEXT,
      decks TEXT,
      type TEXT,
      description TEXT,
      createdAt TEXT,
      summary TEXT,
      illustration TEXT
    );`;
    runSql(this.path, sql);
  }

  saveCard(card) {
    const sql = `INSERT OR REPLACE INTO cards (id,title,content,tags,decks,type,description,createdAt,summary,illustration) VALUES ('${esc(card.id)}','${esc(card.title)}','${esc(card.content)}','${esc(JSON.stringify(Array.from(card.tags)))}','${esc(JSON.stringify(Array.from(card.decks)))}','${esc(card.type)}','${esc(card.description)}','${esc(card.createdAt)}','${esc(card.summary || '')}','${esc(card.illustration || '')}');`;
    runSql(this.path, sql);
  }

  deleteCard(id) {
    const sql = `DELETE FROM cards WHERE id='${esc(id)}';`;
    runSql(this.path, sql);
  }

  loadCards() {
    const sql = `SELECT * FROM cards;`;
    const out = runSql(this.path, sql, ['-json']);
    if (!out) return [];
    return JSON.parse(out).map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      tags: JSON.parse(r.tags || '[]'),
      decks: JSON.parse(r.decks || '[]'),
      type: r.type,
      description: r.description,
      createdAt: r.createdAt,
      summary: r.summary,
      illustration: r.illustration
    }));
  }

  close() {
    try {
      fs.unlinkSync(this.path + '-journal');
    } catch {}
  }
}

module.exports = MemoryDB;
