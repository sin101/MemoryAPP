import sqlite3 from 'sqlite3';
import crypto from 'crypto';

sqlite3.verbose();

function run(db: sqlite3.Database, sql: string, params: any[] | object = []): Promise<void> {
  return new Promise((resolve, reject) => {
    (db as any).run(sql, params, (err: Error | null) => {
      if (err) reject(err); else resolve();
    });
  });
}

function all<T = any>(db: sqlite3.Database, sql: string, params: any[] | object = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    (db as any).all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

class MemoryDB {
  path: string;
  key?: string;
  db: sqlite3.Database;

  constructor(path: string, key?: string) {
    this.path = path;
    this.key = key;
    this.db = new sqlite3.Database(this.path);
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
      illustration TEXT,
      embedding TEXT
    )`;
    const linkSql = `CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      fromId TEXT,
      toId TEXT,
      type TEXT,
      annotation TEXT
    )`;
    this.db.serialize(() => {
      this.db.run(sql);
      this.db.run(linkSql);
    });
  }

  async saveCard(card: any): Promise<void> {
    await run(
      this.db,
      `INSERT OR REPLACE INTO cards (
        id, title, content, source, tags, decks, type, description,
        createdAt, summary, illustration, embedding
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        card.id,
        this.encrypt(card.title),
        this.encrypt(card.content),
        this.encrypt(card.source),
        this.encrypt(JSON.stringify(Array.from(card.tags))),
        this.encrypt(JSON.stringify(Array.from(card.decks))),
        card.type,
        this.encrypt(card.description),
        card.createdAt,
        this.encrypt(card.summary || ''),
        this.encrypt(card.illustration || ''),
        this.encrypt(card.embedding ? JSON.stringify(card.embedding) : '')
      ]
    );
  }

  async deleteCard(id: string): Promise<void> {
    await run(this.db, 'DELETE FROM cards WHERE id = ?', [id]);
  }

  async loadCards(): Promise<any[]> {
    const rows = await all<any>(this.db, 'SELECT * FROM cards');
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
      source: this.decrypt(r.source),
      embedding: JSON.parse(this.decrypt(r.embedding) || 'null')
    }));
  }

  async saveLink(link: any): Promise<void> {
    await run(
      this.db,
      'INSERT OR REPLACE INTO links (id, fromId, toId, type, annotation) VALUES (?, ?, ?, ?, ?)',
      [link.id, link.from, link.to, link.type, this.encrypt(link.annotation || '')]
    );
  }

  async deleteLink(id: string): Promise<void> {
    await run(this.db, 'DELETE FROM links WHERE id = ?', [id]);
  }

  async loadLinks(): Promise<any[]> {
    const rows = await all<any>(this.db, 'SELECT * FROM links');
    return rows.map(r => ({
      id: r.id,
      from: r.fromId,
      to: r.toId,
      type: r.type,
      annotation: this.decrypt(r.annotation)
    }));
  }

  encrypt(text: any) {
    if (!this.key || text === undefined || text === null) return text;
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(this.key).digest();
    const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  decrypt(text: any) {
    if (!this.key || text === undefined || text === null) return text;
    try {
      const [ivHex, dataHex] = String(text).split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const encrypted = Buffer.from(dataHex, 'hex');
      const key = crypto.createHash('sha256').update(this.key).digest();
      const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      return '';
    }
  }

  close() {
    this.db.close();
  }
}

export default MemoryDB;
