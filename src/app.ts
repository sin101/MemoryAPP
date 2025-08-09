// @ts-nocheck
import Card from './card.js';
import Deck from './deck.js';
import Link from './link.js';
import fs from 'fs';
import path from 'path';
import MemoryDB from './db.js';
import { SimpleAI, HuggingFaceAI, TransformersAI, hasLocalModels } from './ai.js';
import { EventEmitter } from 'events';
import { fetchSuggestion } from './suggestions.js';
import crypto from 'crypto';
import JSZip from 'jszip';
import Logger from './logger.js';
import Fuse from 'fuse.js';

class MemoryApp extends EventEmitter {
  cards: Map<string, Card>;
  decks: Map<string, Deck>;
  links: Map<string, Link>;
  linksByCard: Map<string, Set<string>>;
  tagIndex: Map<string, Set<string>>;
  usageStats: Map<string, { count: number; lastOpened: number | null }>;
  fuse: Fuse<Card>;
  nextId: number;
  nextLinkId: number;
  aiEnabled: boolean;
  webSuggestionsEnabled: boolean;
  externalCallsEnabled: boolean;
  backgroundProcessing: boolean;
  ai: any;
  encryptionKey?: string;
  db: MemoryDB | null;
  logger?: Logger;
  constructor(options: any = {}) {
    super();
    this.cards = new Map();
    this.decks = new Map();
    this.links = new Map();
    this.linksByCard = new Map();
    this.tagIndex = new Map();
    this.usageStats = new Map();
    this.fuse = new Fuse([], { keys: ['title', 'content', 'description', 'tags'] });
    this.nextId = 1;
    this.nextLinkId = 1;
    this.aiEnabled = true;
    this.webSuggestionsEnabled = true;
    this.externalCallsEnabled = true;
    this.backgroundProcessing = !!options.backgroundProcessing;
    if (options.ai) {
      this.ai = options.ai;
    } else if (hasLocalModels()) {
      this.ai = new TransformersAI();
    } else if (process.env.HUGGINGFACE_API_KEY) {
      this.ai = new HuggingFaceAI({ autoSelect: true });
    } else {
      this.ai = new SimpleAI();
    }
    this.encryptionKey = options.encryptionKey;
    this.db = options.dbPath ? new MemoryDB(options.dbPath, options.encryptionKey) : null;
    if (this.db) {
      this.loadFromDB();
    }
    if (options.logPath) {
      this.logger = new Logger(options.logPath);
      this.on('error', err => this.logger.error(err.message));
      this.on('cardCreated', c => this.logger.info(`cardCreated:${c.id}`));
      process.on('uncaughtException', err => this.logger.error(`uncaught:${err.message}`));
    }
  }

  async createCard(data) {
    if (!data.id) {
      data.id = String(this.nextId++);
    } else {
      const num = Number(data.id);
      if (!Number.isNaN(num) && num >= this.nextId) {
        this.nextId = num + 1;
      }
    }
    if (this.cards.has(data.id)) {
      throw new Error('Card ID already exists');
    }
    if (data.tags) {
      data.tags = data.tags.map(t => t.toLowerCase());
    }
    const card = new Card(data);
    this.cards.set(card.id, card);
    this.emit('cardCreated', card);
    await this._processAndPersistCard(card);
    this._updateTagIndex(card);
    this._rebuildSearchIndex();
    this._updateSmartDecks();
    return card;
  }

  setAIEnabled(enabled) {
    this.aiEnabled = enabled;
  }

  setWebSuggestionsEnabled(enabled) {
    this.webSuggestionsEnabled = enabled;
  }

  setExternalCallsEnabled(enabled) {
    this.externalCallsEnabled = enabled;
    this.aiEnabled = enabled;
    this.webSuggestionsEnabled = enabled;
  }

  enableLogging(path) {
    this.logger = new Logger(path);
    this.on('error', err => this.logger.error(err.message));
    this.on('cardCreated', c => this.logger.info(`cardCreated:${c.id}`));
    process.on('uncaughtException', err => this.logger.error(`uncaught:${err.message}`));
  }

  enrichCard(cardId) {
    if (!this.aiEnabled) {
      return null;
    }
    const card = this.cards.get(cardId);
    if (!card) {
      return null;
    }
    const basis = card.content || card.source || card.title;
    if (basis && card.tags.size === 0) {
      const words = Array.from(
        new Set(basis.toLowerCase().split(/\W+/).filter(w => w.length > 3))
      );
      for (const w of words.slice(0, 3)) {
        card.addTag(w.toLowerCase());
      }
    }
    if (basis && !card.description) {
      card.description = basis.slice(0, 100);
    }
    card._updateSearchText();
    return card;
  }

  getDeck(name) {
    const norm = name.toLowerCase();
    let deck = this.decks.get(norm);
    if (!deck) {
      deck = new Deck(norm);
      this.decks.set(norm, deck);
      this.emit('deckCreated', deck);
    }
    return deck;
  }

  addCardToDeck(cardId, deckName) {
    const card = this.cards.get(cardId);
    if (!card) {
      throw new Error('Card not found');
    }
    const deck = this.getDeck(deckName);
    deck.addCard(card);
    this.emit('cardUpdated', card);
    this.emit('deckUpdated', deck);
    if (this.db) {
      this.db.saveCard(card).catch(e => this.emit('error', e));
    }
  }

  async createAudioNote(sourcePath, options = {}) {
    const transcript = await this.ai.transcribe(sourcePath);
    const buffer = await fs.promises.readFile(sourcePath);
    const stored = await this.saveMedia(buffer, path.basename(sourcePath));
    await fs.promises.unlink(sourcePath).catch(() => {});
    const data = Object.assign({}, options, {
      content: transcript,
      source: stored,
      type: 'audio'
    });
    return this.createCard(data);
  }

  async createVideoNote(sourcePath, options = {}) {
    const transcript = await this.ai.transcribe(sourcePath);
    const buffer = await fs.promises.readFile(sourcePath);
    const stored = await this.saveMedia(buffer, path.basename(sourcePath));
    await fs.promises.unlink(sourcePath).catch(() => {});
    const data = Object.assign({}, options, {
      content: transcript,
      source: stored,
      type: 'video'
    });
    return this.createCard(data);
  }

  async updateCard(cardId, data) {
    const card = this.cards.get(cardId);
    if (!card) {
      return null;
    }
    const oldTags = new Set(card.tags);
    card.update(data);
    delete card.embedding;
    this.emit('cardUpdated', card);
    await this._processAndPersistCard(card);
    this._updateTagIndex(card, oldTags);
    this._rebuildSearchIndex();
    this._updateSmartDecks();
    return card;
  }

  async _processAndPersistCard(card) {
    if (!card.embedding && this.aiEnabled && this.ai.embed) {
      const basis = card.content || card.source || card.title || '';
      if (basis) {
        try {
          card.embedding = await this.ai.embed(basis);
        } catch (e) {
          this.emit('error', e);
        }
      }
    }
    if (this.aiEnabled) {
      this.enrichCard(card.id);
      if (this.backgroundProcessing) {
        this.processCard(card)
          .then(() => this.emit('cardProcessed', card))
          .catch(err => this.emit('error', err));
      } else {
        try {
          await this.processCard(card);
          this.emit('cardProcessed', card);
        } catch (err) {
          this.emit('error', err);
        }
      }
    }
    if (this.db) {
      try {
        await this.db.saveCard(card);
      } catch (e) {
        this.emit('error', e);
      }
    }
  }

  searchByTag(tag) {
    const t = tag.toLowerCase();
    const ids = this.tagIndex.get(t);
    if (!ids) {
      return [];
    }
    const results = [];
    for (const id of ids) {
      const card = this.cards.get(id);
      if (card) {
        results.push(card);
      }
    }
    return results;
  }

  searchByText(query) {
    return this.fuse.search(query).map(r => r.item);
  }

  async searchBySemantic(query, limit = 5) {
    if (!this.aiEnabled || !this.ai.embed) {
      return this.searchByText(query).slice(0, limit);
    }
    const qVec = await this.ai.embed(query);
    const scored: any[] = [];
    for (const card of this.cards.values()) {
      if (!card.embedding) {
        continue;
      }
      const sim = cosine(qVec, card.embedding);
      if (sim > 0) {
        scored.push({ card, sim });
      }
    }
    scored.sort((a: any, b: any) => b.sim - a.sim);
    return scored.slice(0, limit).map((s: any) => s.card);

    function cosine(a, b) {
      let dot = 0, na = 0, nb = 0;
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      return na && nb ? dot / Math.sqrt(na * nb) : 0;
    }
  }

  recordCardUsage(cardId) {
    const stat = this.usageStats.get(cardId) || { count: 0, lastOpened: null };
    stat.count++;
    stat.lastOpened = Date.now();
    this.usageStats.set(cardId, stat);
    this._updateSmartDecks();
  }

  _setDeckCards(deckName, ids) {
    const deck = this.getDeck(deckName);
    const oldIds = new Set(deck.cards);
    let changed = false;
    for (const id of oldIds) {
      if (!ids.has(id)) {
        deck.cards.delete(id);
        const card = this.cards.get(id);
        if (card) {
          card.decks.delete(deckName);
          this.emit('cardUpdated', card);
          if (this.db) {
            this.db.saveCard(card).catch(e => this.emit('error', e));
          }
        }
        changed = true;
      }
    }
    for (const id of ids) {
      if (!deck.cards.has(id)) {
        const card = this.cards.get(id);
        if (card) {
          deck.addCard(card);
          this.emit('cardUpdated', card);
          if (this.db) {
            try {
              this.db.saveCard(card).catch(e => this.emit('error', e));
            } catch (e) {
              this.emit('error', e);
            }
          }
        }
        changed = true;
      }
    }
    if (changed) {
      this.emit('deckUpdated', deck);
    }
  }

  _updateRecentDeck() {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const ids = new Set();
    for (const card of this.cards.values()) {
      if (new Date(card.createdAt).getTime() >= cutoff) {
        ids.add(card.id);
      }
    }
    this._setDeckCards('recent', ids);
  }

  _updateFrequentDeck() {
    const ids = new Set(
      Array.from(this.usageStats.entries())
        .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
        .slice(0, 5)
        .map(([id]) => id)
    );
    this._setDeckCards('frequent', ids);
  }

  _updateUnseenDeck() {
    const ids = new Set();
    for (const card of this.cards.values()) {
      const stat = this.usageStats.get(card.id);
      if (!stat || stat.count === 0) {
        ids.add(card.id);
      }
    }
    this._setDeckCards('unseen', ids);
  }

  _updateStaleDeck() {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const ids = new Set();
    for (const card of this.cards.values()) {
      const stat = this.usageStats.get(card.id);
      if (!stat || !stat.lastOpened || stat.lastOpened < cutoff) {
        ids.add(card.id);
      }
    }
    this._setDeckCards('stale', ids);
  }

  _updateTagDecks() {
    for (const [tag, set] of this.tagIndex.entries()) {
      const deckName = `tag:${tag}`;
      if (set.size >= 3) {
        this._setDeckCards(deckName, set);
      } else if (this.decks.has(deckName)) {
        this.removeDeck(deckName);
      }
    }
    for (const name of Array.from(this.decks.keys())) {
      if (name.startsWith('tag:') && !this.tagIndex.has(name.slice(4))) {
        this.removeDeck(name);
      }
    }
  }

  _updateSmartDecks() {
    this._updateRecentDeck();
    this._updateFrequentDeck();
    this._updateUnseenDeck();
    this._updateStaleDeck();
    this._updateTagDecks();
  }

  _addToTagIndex(card) {
    for (const tag of card.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag).add(card.id);
    }
  }

  _removeFromTagIndex(card) {
    for (const tag of card.tags) {
      const set = this.tagIndex.get(tag);
      if (set) {
        set.delete(card.id);
        if (set.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }

  _updateTagIndex(card, oldTags = new Set()) {
    for (const tag of oldTags) {
      if (!card.tags.has(tag)) {
        const set = this.tagIndex.get(tag);
        if (set) {
          set.delete(card.id);
          if (set.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      }
    }
    this._addToTagIndex(card);
  }

  _rebuildSearchIndex() {
    this.fuse.setCollection(Array.from(this.cards.values()));
  }

  async getCardSuggestions(cardId, limit = 3) {
    if (!this.webSuggestionsEnabled) {
      return [];
    }
    const card = this.cards.get(cardId);
    if (!card) {
      return [];
    }
    const pending = [];
    for (const tag of card.tags) {
      if (pending.length >= limit) {
        break;
      }
      pending.push(fetchSuggestion(tag, card.type));
    }
    const results = await Promise.all(pending);
    return results.filter(r => r);
  }

  async getThemeSuggestions(limit = 3) {
    if (!this.webSuggestionsEnabled) {
      return [];
    }
    const counts = new Map();
    for (const card of this.cards.values()) {
      for (const tag of card.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
    const pending = [];
    for (const tag of sorted) {
      if (pending.length >= limit) {
        break;
      }
      pending.push(fetchSuggestion(tag));
    }
    const results = await Promise.all(pending);
    return results.filter(r => r);
  }

  async getWebSuggestions(limit = 3) {
    // backward compatibility: alias to theme suggestions
    return this.getThemeSuggestions(limit);
  }

  removeCard(cardId) {
    const card = this.cards.get(cardId);
    if (!card) {
      return false;
    }
    const deckNames = Array.from(card.decks);
    for (const deckName of deckNames) {
      const deck = this.decks.get(deckName);
      if (deck) {
        deck.removeCard(card);
        this.emit('deckUpdated', deck);
      }
    }
    // remove links involving this card
    const linkIds = this.linksByCard.get(cardId);
    if (linkIds) {
      for (const id of Array.from(linkIds)) {
        this.removeLink(id);
      }
    }
    this.cards.delete(cardId);
    this._removeFromTagIndex(card);
    this._rebuildSearchIndex();
    this.emit('cardRemoved', card);
    if (this.db) {
      this.db.deleteCard(cardId).catch(e => this.emit('error', e));
    }
    this._updateSmartDecks();
    return true;
  }

  removeDeck(deckName) {
    const norm = deckName.toLowerCase();
    const deck = this.decks.get(norm);
    if (!deck) {
      return false;
    }
    for (const cardId of Array.from(deck.cards)) {
      const card = this.cards.get(cardId);
      if (card) {
        card.decks.delete(norm);
        this.emit('cardUpdated', card);
        if (this.db) {
          this.db.saveCard(card).catch(e => this.emit('error', e));
        }
      }
    }
    this.decks.delete(norm);
    this.emit('deckRemoved', norm);
    return true;
  }

  _indexLink(link) {
    if (!this.linksByCard.has(link.from)) {
      this.linksByCard.set(link.from, new Set());
    }
    this.linksByCard.get(link.from).add(link.id);
    if (!this.linksByCard.has(link.to)) {
      this.linksByCard.set(link.to, new Set());
    }
    this.linksByCard.get(link.to).add(link.id);
  }

  _unindexLink(link) {
    const fromSet = this.linksByCard.get(link.from);
    if (fromSet) {
      fromSet.delete(link.id);
      if (fromSet.size === 0) {
        this.linksByCard.delete(link.from);
      }
    }
    const toSet = this.linksByCard.get(link.to);
    if (toSet) {
      toSet.delete(link.id);
      if (toSet.size === 0) {
        this.linksByCard.delete(link.to);
      }
    }
  }

  createLink(fromId, toId, type = 'related', annotation = '') {
    if (fromId === toId) {
      throw new Error('Cannot link card to itself');
    }
    const from = this.cards.get(fromId);
    const to = this.cards.get(toId);
    if (!from || !to) {
      throw new Error('Both cards must exist to create a link');
    }
    const normType = type.toLowerCase();
    for (const l of this.links.values()) {
      if (l.from === fromId && l.to === toId && l.type === normType) {
        throw new Error('Link already exists');
      }
    }
    const id = String(this.nextLinkId++);
    const link = new Link({ id, from: fromId, to: toId, type: normType, annotation });
    this.links.set(id, link);
    this._indexLink(link);
    if (this.db) {
      this.db.saveLink(link).catch(e => this.emit('error', e));
    }
    this.emit('linkCreated', link);
    return link;
  }

  updateLink(linkId, data) {
    const link = this.links.get(linkId);
    if (!link) {
      return null;
    }
    const newType = data.type !== undefined ? data.type.toLowerCase() : link.type;
    for (const l of this.links.values()) {
      if (l !== link && l.from === link.from && l.to === link.to && l.type === newType) {
        throw new Error('Link already exists');
      }
    }
    link.update({
      type: data.type !== undefined ? newType : undefined,
      annotation: data.annotation,
    });
    if (this.db) {
      this.db.saveLink(link).catch(e => this.emit('error', e));
    }
    this.emit('linkUpdated', link);
    return link;
  }

  getLinks(cardId) {
    const ids = this.linksByCard.get(cardId);
    if (!ids) {
      return [];
    }
    const results = [];
    for (const id of ids) {
      const link = this.links.get(id);
      if (link) {
        results.push(link);
      }
    }
    return results;
  }

  getLinkedCardIds(cardId) {
    const ids = this.linksByCard.get(cardId);
    if (!ids) {
      return [];
    }
    const result = new Set();
    for (const id of ids) {
      const link = this.links.get(id);
      if (link) {
        result.add(link.from === cardId ? link.to : link.from);
      }
    }
    return Array.from(result);
  }

  removeLink(linkId) {
    const link = this.links.get(linkId);
    const res = this.links.delete(linkId);
    if (res && link) {
      this._unindexLink(link);
      if (this.db) {
        this.db.deleteLink(linkId).catch(e => this.emit('error', e));
      }
      this.emit('linkRemoved', link);
    }
    return res;
  }

  getGraph(options = {}) {
    let deckName = null;
    let tagFilter = null;
    let linkTypeFilter = null;
    if (typeof options === 'string') {
      deckName = options.toLowerCase();
    } else {
      deckName = options.deck ? options.deck.toLowerCase() : null;
      tagFilter = options.tag ? options.tag.toLowerCase() : null;
      linkTypeFilter = options.linkType ? options.linkType.toLowerCase() : null;
    }

    let cardIds;
    if (deckName) {
      const deck = this.decks.get(deckName);
      if (!deck) {
        return { nodes: [], edges: [] };
      }
      cardIds = new Set(deck.cards);
    } else {
      cardIds = new Set(this.cards.keys());
    }

    const nodes = [];
    for (const id of cardIds) {
      const card = this.cards.get(id);
      if (!card) {
        continue;
      }
      if (tagFilter && !card.tags.has(tagFilter)) {
        continue;
      }
      nodes.push({
        id: card.id,
        title: card.title,
        tags: Array.from(card.tags),
        decks: Array.from(card.decks),
      });
    }

    const includedIds = new Set(nodes.map(n => n.id));

    const edges = [];
    const seen = new Set();
    for (const id of includedIds) {
      const linkIds = this.linksByCard.get(id);
      if (!linkIds) {
        continue;
      }
      for (const linkId of linkIds) {
        if (seen.has(linkId)) {
          continue;
        }
        const link = this.links.get(linkId);
        if (!link) {
          continue;
        }
        seen.add(linkId);
        if (linkTypeFilter && link.type !== linkTypeFilter) {
          continue;
        }
        if (includedIds.has(link.from) && includedIds.has(link.to)) {
          edges.push({
            id: link.id,
            from: link.from,
            to: link.to,
            type: link.type,
            annotation: link.annotation,
          });
        }
      }
    }

    return { nodes, edges };
  }

  async processCard(card) {
    const tasks = [];
    if (!card.summary) {
      tasks.push(['summary', this.summarizeCard(card)]);
    }
    if (!card.illustration) {
      tasks.push(['illustration', this.generateIllustration(card.title)]);
    }
    if (tasks.length === 0) {
      return;
    }
    const results = await Promise.allSettled(tasks.map(([, p]) => p));
    for (let i = 0; i < results.length; i++) {
      const [key] = tasks[i];
      const r = results[i];
      if (r.status === 'fulfilled') {
        card[key] = r.value;
      } else {
        this.emit('error', r.reason);
      }
    }
  }

  async summarize(text) {
    return this.ai.summarize(text);
  }

  async summarizeCard(card) {
    if (this.ai.summarizeCard) {
      return this.ai.summarizeCard(card);
    }
    const text = card.content || card.source || card.title;
    return this.summarize(text);
  }

  async generateIllustration(title) {
    return this.ai.generateIllustration(title);
  }

  async chat(query) {
    if (!this.aiEnabled) {
      return 'AI disabled';
    }
    return this.ai.chat(query, this);
  }

  toJSON() {
    return {
      cards: Array.from(this.cards.values()).map(card => ({
        id: card.id,
        title: card.title,
        content: card.content,
        source: card.source,
        tags: Array.from(card.tags),
        decks: Array.from(card.decks),
        type: card.type,
        description: card.description,
        createdAt: card.createdAt,
        summary: card.summary,
      illustration: card.illustration,
      embedding: card.embedding,
    })),
      decks: Array.from(this.decks.values()).map(deck => ({
        name: deck.name,
        cards: Array.from(deck.cards),
      })),
      links: Array.from(this.links.values()).map(link => ({
        id: link.id,
        from: link.from,
        to: link.to,
        type: link.type,
        annotation: link.annotation,
      })),
    };
  }

  async saveToFile(path) {
    await fs.promises.writeFile(path, JSON.stringify(this.toJSON(), null, 2));
  }

  async saveEncryptedToFile(path, password) {
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(password).digest();
    const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
    const json = Buffer.from(JSON.stringify(this.toJSON()));
    const encrypted = Buffer.concat([iv, cipher.update(json), cipher.final()]);
    await fs.promises.writeFile(path, encrypted);
  }

  async saveMedia(buffer, filename) {
    const dir = 'storage';
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    let data = buffer;
    if (this.encryptionKey) {
      const iv = crypto.randomBytes(16);
      const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
      const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
      const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
      data = Buffer.concat([iv, encrypted]);
    }
    await fs.promises.writeFile(filePath, data);
    return filePath;
  }

  async loadMedia(filePath) {
    let data = await fs.promises.readFile(filePath);
    if (this.encryptionKey) {
      const iv = data.subarray(0, 16);
      const encrypted = data.subarray(16);
      const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
      const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
      data = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
    return data;
  }

  async exportZipBuffer() {
    const zip = new JSZip();
    zip.file('data.json', JSON.stringify(this.toJSON(), null, 2));
    const dir = 'storage';
    if (fs.existsSync(dir)) {
      const files = await fs.promises.readdir(dir);
      for (const f of files) {
        const content = await fs.promises.readFile(path.join(dir, f));
        zip.file(`media/${f}`, content);
      }
    }
    return await zip.generateAsync({ type: 'nodebuffer' });
  }

  async exportZip(zipPath) {
    const buffer = await this.exportZipBuffer();
    await fs.promises.writeFile(zipPath, buffer);
  }

  static async importZipBuffer(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const json = JSON.parse(await zip.file('data.json').async('string'));
    const app = MemoryApp.fromJSON(json);
    const dir = 'storage';
    await fs.promises.mkdir(dir, { recursive: true });
    const media = Object.keys(zip.files).filter(
      n => n.startsWith('media/') && !zip.files[n].dir
    );
    for (const name of media) {
      const content = await zip.file(name).async('nodebuffer');
      const fname = name.replace('media/', '');
      await fs.promises.writeFile(path.join(dir, fname), content);
    }
    return app;
  }

  static async importZip(zipPath) {
    const buffer = await fs.promises.readFile(zipPath);
    return MemoryApp.importZipBuffer(buffer);
  }

  static fromJSON(data) {
    const app = new MemoryApp();
    app.aiEnabled = false;
    for (const cardData of data.cards || []) {
      if (cardData.tags) {
        cardData.tags = cardData.tags.map(t => t.toLowerCase());
      }
      if (cardData.decks) {
        cardData.decks = cardData.decks.map(d => d.toLowerCase());
      }
      const card = new Card(cardData);
      app.cards.set(card.id, card);
      app._addToTagIndex(card);
      const num = Number(card.id);
      if (!Number.isNaN(num) && num >= app.nextId) {
        app.nextId = num + 1;
      }
    }
    for (const deckData of data.decks || []) {
      const deck = app.getDeck(deckData.name);
      for (const cardId of deckData.cards) {
        const card = app.cards.get(cardId);
        if (card) {
          deck.addCard(card);
        }
      }
    }
    for (const linkData of data.links || []) {
      // ensure cards exist before creating link
      if (app.cards.has(linkData.from) && app.cards.has(linkData.to)) {
        const link = new Link({
          id: linkData.id,
          from: linkData.from,
          to: linkData.to,
          type: (linkData.type || 'related').toLowerCase(),
          annotation: linkData.annotation,
        });
        app.links.set(link.id, link);
        app._indexLink(link);
        const num = Number(link.id);
        if (!Number.isNaN(num) && num >= app.nextLinkId) {
          app.nextLinkId = num + 1;
        }
      }
    }
    return app;
  }

  static async loadFromFile(path) {
    const data = JSON.parse(await fs.promises.readFile(path, 'utf8'));
    return MemoryApp.fromJSON(data);
  }

  static async loadEncryptedFromFile(path, password) {
    const data = await fs.promises.readFile(path);
    const iv = data.slice(0, 16);
    const encrypted = data.slice(16);
    const key = crypto.createHash('sha256').update(password).digest();
    const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
    return MemoryApp.fromJSON(JSON.parse(json));
  }

  async loadFromDB() {
    const stored = await this.db.loadCards();
    for (const data of stored) {
      data.tags = data.tags.map(t => t.toLowerCase());
      data.decks = data.decks.map(d => d.toLowerCase());
      const card = new Card(data);
      this.cards.set(card.id, card);
      this._addToTagIndex(card);
      const num = Number(card.id);
      if (!Number.isNaN(num) && num >= this.nextId) {
        this.nextId = num + 1;
      }
      for (const deckName of card.decks) {
        const deck = this.getDeck(deckName);
        deck.cards.add(card.id);
      }
    }
    const links = await this.db.loadLinks();
    for (const data of links) {
      const link = new Link(data);
      this.links.set(link.id, link);
      this._indexLink(link);
      const num = Number(link.id);
      if (!Number.isNaN(num) && num >= this.nextLinkId) {
        this.nextLinkId = num + 1;
      }
    }
    this._rebuildSearchIndex();
    this._updateSmartDecks();
  }
}

export default MemoryApp;
