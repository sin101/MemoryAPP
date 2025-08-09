import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import crypto from 'crypto';

class MemoryDB {
  path: string;
  key?: string;
  db!: Database;
  ready: Promise<void>;

  constructor(path: string, key?: string) {
    this.path = path;
    this.key = key;
    this.ready = this.init();
  }

  private async init() {
    this.db = await open({ filename: this.path, driver: sqlite3.Database });
    await this.db.exec(`CREATE TABLE IF NOT EXISTS cards (
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
    )`);
    await this.db.exec(`CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      fromId TEXT,
      toId TEXT,
      type TEXT,
      annotation TEXT
    )`);
    await this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS card_search USING fts5(id, title, content, description)`);
  }

  async saveCard(card: any): Promise<void> {
    await this.ready;
    await this.db.run(
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
    await this.db.run(
      `INSERT OR REPLACE INTO card_search (rowid, id, title, content, description)
       VALUES ((SELECT rowid FROM card_search WHERE id = ?), ?, ?, ?, ?)`,
      [
        card.id,
        card.id,
        this.encrypt(card.title),
        this.encrypt(card.content),
        this.encrypt(card.description)
      ]
    );
  }

  async deleteCard(id: string): Promise<void> {
    await this.ready;
    await this.db.run('DELETE FROM cards WHERE id = ?', id);
    await this.db.run('DELETE FROM card_search WHERE id = ?', id);
  }

  async loadCards(): Promise<any[]> {
    await this.ready;
    const rows = await this.db.all<any[]>('SELECT * FROM cards');
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
    await this.ready;
    await this.db.run(
      'INSERT OR REPLACE INTO links (id, fromId, toId, type, annotation) VALUES (?, ?, ?, ?, ?)',
      [link.id, link.from, link.to, link.type, this.encrypt(link.annotation || '')]
    );
  }

  async deleteLink(id: string): Promise<void> {
    await this.ready;
    await this.db.run('DELETE FROM links WHERE id = ?', id);
  }

  async loadLinks(): Promise<any[]> {
    await this.ready;
    const rows = await this.db.all<any[]>('SELECT * FROM links');
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

  async close() {
    await this.ready;
    await this.db.close();
  }
}

export default MemoryDB;
