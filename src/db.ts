import Database from 'better-sqlite3';
import crypto from 'crypto';

class MemoryDB {
  path: string;
  key?: string;
  db: Database.Database;
  saveStmt: any;
  deleteStmt: any;
  loadStmt: any;
  linkSaveStmt: any;
  linkDeleteStmt: any;
  linkLoadStmt: any;

  constructor(path: string, key?: string) {
    this.path = path;
    this.key = key;
    this.db = new Database(this.path);
    this.init();
    this.saveStmt = this.db.prepare(`INSERT OR REPLACE INTO cards (
      id, title, content, source, tags, decks, type, description,
      createdAt, summary, illustration, embedding
    ) VALUES (
      @id, @title, @content, @source, @tags, @decks, @type, @description,
      @createdAt, @summary, @illustration, @embedding
    )`);
    this.deleteStmt = this.db.prepare('DELETE FROM cards WHERE id = ?');
    this.loadStmt = this.db.prepare('SELECT * FROM cards');
    this.linkSaveStmt = this.db.prepare(
      'INSERT OR REPLACE INTO links (id, fromId, toId, type, annotation) VALUES (@id, @from, @to, @type, @annotation)'
    );
    this.linkDeleteStmt = this.db.prepare('DELETE FROM links WHERE id = ?');
    this.linkLoadStmt = this.db.prepare('SELECT * FROM links');
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
    this.db.exec(sql);
    this.db.exec(linkSql);
  }

  saveCard(card: any) {
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
      illustration: this.encrypt(card.illustration || ''),
      embedding: this.encrypt(card.embedding ? JSON.stringify(card.embedding) : ''),
    });
  }

  deleteCard(id: string) {
    this.deleteStmt.run(id);
  }

  loadCards() {
    const rows = this.loadStmt.all();
    return rows.map((r: any) => ({
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
      embedding: JSON.parse(this.decrypt(r.embedding) || 'null'),
    }));
  }

  saveLink(link: any) {
    this.linkSaveStmt.run({
      id: link.id,
      from: link.from,
      to: link.to,
      type: link.type,
      annotation: this.encrypt(link.annotation || ''),
    });
  }

  deleteLink(id: string) {
    this.linkDeleteStmt.run(id);
  }

  loadLinks() {
    const rows = this.linkLoadStmt.all();
    return rows.map((r: any) => ({
      id: r.id,
      from: r.fromId,
      to: r.toId,
      type: r.type,
      annotation: this.decrypt(r.annotation),
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
