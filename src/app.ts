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
import { createLogger } from './logger.js';
import Fuse from 'fuse.js';
import { Worker } from 'worker_threads';
import type { AppOptions, CardData, AIProvider } from './types.js';
import { config } from './config.js';

class MemoryApp extends EventEmitter {
  cards: Map<string, Card>;
  decks: Map<string, Deck>;
  links: Map<string, Link>;
  linksByCard: Map<string, Set<string>>;
  linksByEndpoints: Set<string>;
  tagIndex: Map<string, Set<string>>;
  usageStats: Map<string, { count: number; lastOpened: number | null }>;
  fuse: Fuse<Card>;
  nextId: number;
  nextLinkId: number;
  aiEnabled: boolean;
  webSuggestionsEnabled: boolean;
  externalCallsEnabled: boolean;
  backgroundProcessing: boolean;
  ai: AIProvider;
  encryptionKey?: string;
  db: MemoryDB | null;
  logger?: ReturnType<typeof createLogger>;
  worker?: Worker;
  workerSeq: number;
  workerTasks: Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>;
  lshPlanes: number[][];
  lshBuckets: Map<string, Set<string>>;
  cardBuckets: Map<string, string>;
  embeddingDim: number;
  private _smartDeckTimer: ReturnType<typeof setTimeout> | null = null;
  private _jsonCache: ReturnType<MemoryApp['_buildJSON']> | null = null;
  lastModified: number = Date.now();
  constructor(options: AppOptions = {}) {
    super();
    this.cards = new Map();
    this.decks = new Map();
    this.links = new Map();
    this.linksByCard = new Map();
    this.linksByEndpoints = new Set();
    this.tagIndex = new Map();
    this.usageStats = new Map();
    this.fuse = this._createFuse();
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
    } else if (config.HUGGINGFACE_API_KEY) {
      this.ai = new HuggingFaceAI({ autoSelect: true, apiKey: config.HUGGINGFACE_API_KEY });
    } else {
      this.ai = new SimpleAI();
    }
    this.encryptionKey = options.encryptionKey;
    this.db = options.dbPath ? new MemoryDB(options.dbPath, options.encryptionKey) : null;
    if (this.db) {
      this.db.ready.then(() => this.loadFromDB());
    }
    if (options.logPath) {
      this.logger = createLogger(options.logPath);
      this.on('error', err => this.logger?.error(err.message));
      this.on('cardCreated', c => this.logger?.info(`cardCreated:${c.id}`));
      process.on('uncaughtException', err => this.logger?.error(`uncaught:${err.message}`));
    }
    this.workerSeq = 0;
    this.workerTasks = new Map();
    this.lshPlanes = [];
    this.lshBuckets = new Map();
    this.cardBuckets = new Map();
    this.embeddingDim = 0;
    if (!options.ai) {
      try {
        this.worker = new Worker(path.join(__dirname, 'aiWorker.js'), {
          workerData: { aiType: this.ai.constructor.name, apiKey: config.HUGGINGFACE_API_KEY }
        });
        this.worker.on('message', ({ id, result, error }) => {
          const task = this.workerTasks.get(id);
          if (!task) return;
          if (error) task.reject(error); else task.resolve(result);
          this.workerTasks.delete(id);
        });
        this.worker.unref();
      } catch {
        this.worker = undefined;
      }
    }
  }

  private _normalizeDeckName(name: string) {
    const n = (name ?? '').trim().toLowerCase().slice(0, 64);
    return n.length > 0 ? n : '';
  }

  private _normalizeTag(tag: string) {
    const t = (tag ?? '').trim().toLowerCase().slice(0, 64);
    return t.length > 0 ? t : '';
  }

  private _normalizeTagList(tags?: Iterable<string>) {
    if (!tags) {
      return [];
    }
    const result = new Set<string>();
    for (const tag of tags) {
      const norm = this._normalizeTag(tag);
      if (norm) {
        result.add(norm);
      }
    }
    return Array.from(result);
  }

  private _normalizeDeckList(decks?: Iterable<string>) {
    if (!decks) {
      return [];
    }
    const result = new Set<string>();
    for (const deck of decks) {
      const norm = this._normalizeDeckName(deck);
      if (norm) {
        result.add(norm);
      }
    }
    return Array.from(result);
  }

  private _persistCard(card: Card): Promise<void> {
    if (!this.db) {
      return Promise.resolve();
    }
    return this.db.saveCard({
      id: card.id,
      title: card.title,
      content: card.content,
      source: card.source,
      tags: card.tags,
      decks: card.decks,
      type: card.type,
      description: card.description,
      createdAt: card.createdAt,
      summary: card.summary,
      illustration: card.illustration,
      embedding: card.embedding ?? null,
    }).catch(e => {
      this.emit('error', e);
    });
  }

  private _persistLink(link: Link): Promise<void> {
    if (!this.db) {
      return Promise.resolve();
    }
    return this.db.saveLink(link).catch(e => {
      this.emit('error', e);
    });
  }

  private _deleteCardRecord(cardId: string): Promise<void> {
    if (!this.db) {
      return Promise.resolve();
    }
    return this.db.deleteCard(cardId).catch(e => {
      this.emit('error', e);
    });
  }

  private _deleteLinkRecord(linkId: string): Promise<void> {
    if (!this.db) {
      return Promise.resolve();
    }
    return this.db.deleteLink(linkId).catch(e => {
      this.emit('error', e);
    });
  }

  private _runAI(action: string, payload: string | Card): Promise<unknown> {
    if (!this.worker) {
      // Fallback to main-thread AI
      switch (action) {
        case 'embed':
          return this.ai.embed ? this.ai.embed(payload as string) : Promise.resolve([]);
        case 'summarizeCard':
          return this.ai.summarizeCard ? this.ai.summarizeCard(payload as Card) : this.ai.summarize((payload as Card).content || (payload as Card).title || '');
        case 'generateIllustration':
          return this.ai.generateIllustration(payload as string);
        default:
          return Promise.resolve(null);
      }
    }
    const id = ++this.workerSeq;
    return new Promise((resolve, reject) => {
      this.workerTasks.set(id, { resolve, reject });
      this.worker!.postMessage({ id, action, payload });
    });
  }

  async createCard(data: CardData) {
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
      data.tags = this._normalizeTagList(data.tags);
    }
    if (data.decks) {
      data.decks = this._normalizeDeckList(data.decks);
    }
    const card = new Card(data as Omit<CardData, 'id'> & { id: string });
    this.cards.set(card.id, card);
    this.emit('cardCreated', card);
    const initialDecks = Array.from(card.decks);
    await this._processAndPersistCard(card);
    this._updateTagIndex(card);
    this._fuseAddCard(card);
    for (const deckName of initialDecks) {
      this.addCardToDeck(card.id, deckName);
    }
    this._debouncedSmartDecks();
    return card;
  }

  setAIEnabled(enabled: boolean) {
    this.aiEnabled = enabled;
  }

  setWebSuggestionsEnabled(enabled: boolean) {
    this.webSuggestionsEnabled = enabled;
  }

  setExternalCallsEnabled(enabled: boolean) {
    this.externalCallsEnabled = enabled;
    this.aiEnabled = enabled;
    this.webSuggestionsEnabled = enabled;
  }

  enableLogging(path: string) {
    this.logger = createLogger(path);
    this.on('error', err => this.logger?.error(err.message));
    this.on('cardCreated', c => this.logger?.info(`cardCreated:${c.id}`));
    process.on('uncaughtException', err => this.logger?.error(`uncaught:${err.message}`));
  }

  enrichCard(cardId: string) {
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

  getDeck(name: string) {
    const norm = this._normalizeDeckName(name);
    if (!norm) {
      throw new Error('Deck name is required');
    }
    let deck = this.decks.get(norm);
    if (!deck) {
      deck = new Deck(norm);
      this.decks.set(norm, deck);
      this.emit('deckCreated', deck);
    }
    return deck;
  }

  addCardToDeck(cardId: string, deckName: string) {
    const card = this.cards.get(cardId);
    if (!card) {
      throw new Error('Card not found');
    }
    const deck = this.getDeck(deckName);
    if (deck.cards.has(card.id)) {
      return deck;
    }
    deck.addCard(card);
    this.emit('cardUpdated', card);
    this.emit('deckUpdated', deck);
    void this._persistCard(card);
    return deck;
  }

  removeCardFromDeck(cardId: string, deckName: string) {
    const norm = this._normalizeDeckName(deckName);
    const deck = norm ? this.decks.get(norm) : undefined;
    const card = this.cards.get(cardId);
    if (!deck || !card || !deck.cards.has(card.id)) {
      return false;
    }
    deck.removeCard(card);
    this.emit('cardUpdated', card);
    this.emit('deckUpdated', deck);
    void this._persistCard(card);
    return true;
  }

  listDecks() {
    return Array.from(this.decks.values()).map(deck => ({
      name: deck.name,
      cards: Array.from(deck.cards),
      size: deck.cards.size,
    }));
  }

  getDeckSnapshot(deckName: string) {
    const norm = this._normalizeDeckName(deckName);
    if (!norm) {
      return null;
    }
    const deck = this.decks.get(norm);
    if (!deck) {
      return null;
    }
    return {
      name: deck.name,
      cards: Array.from(deck.cards),
      size: deck.cards.size,
    };
  }

  setBackgroundProcessing(enabled: boolean) {
    this.backgroundProcessing = enabled;
  }

  private async _createTranscribedMedia(kind: 'audio' | 'video', sourcePath: string, options: Partial<CardData> = {}) {
    const transcript = this.ai.transcribe ? await this.ai.transcribe(sourcePath) : '';
    const stored = await this.saveMedia(sourcePath, path.basename(sourcePath));
    return this.createCard({
      ...options,
      content: options.content ?? transcript,
      source: stored,
      type: kind,
    });
  }

  async createAudioNote(sourcePath: string, options: Partial<CardData> = {}) {
    return this._createTranscribedMedia('audio', sourcePath, options);
  }

  async createVideoNote(sourcePath: string, options: Partial<CardData> = {}) {
    return this._createTranscribedMedia('video', sourcePath, options);
  }

  async updateCard(cardId: string, data: Partial<CardData>) {
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
    this._fuseUpdateCard(card);
    this._debouncedSmartDecks();
    return card;
  }

  async _processAndPersistCard(card: Card) {
    this._removeFromLSH(card.id);
    if (!card.embedding && this.aiEnabled) {
      const basis = card.content || card.source || card.title || '';
      if (basis) {
        try {
          card.embedding = await this._runAI('embed', basis) as number[];
        } catch (e) {
          this.emit('error', e);
        }
      }
    }
    if (card.embedding) {
      this._addToLSH(card);
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
    await this._persistCard(card);
  }

  searchByTag(tag: string) {
    const t = this._normalizeTag(tag);
    if (!t) {
      return [];
    }
    const ids = this.tagIndex.get(t);
    if (!ids) {
      return [];
    }
    const results: Card[] = [];
    for (const id of ids) {
      const card = this.cards.get(id);
      if (card) {
        results.push(card);
      }
    }
    return results;
  }

  searchByText(query: string) {
    return this.fuse.search(query).map(r => r.item);
  }

  async searchBySemantic(query: string, limit = 5) {
    if (!this.aiEnabled || !this.ai.embed) {
      return this.searchByText(query).slice(0, limit);
    }
    const qVec = await this.ai.embed(query);
    if (this.embeddingDim === 0 || this.lshPlanes.length === 0) {
      return this.searchByText(query).slice(0, limit);
    }
    const bucket = this.lshBuckets.get(this._hashEmbedding(qVec));
    if (!bucket || bucket.size === 0) {
      return this.searchByText(query).slice(0, limit);
    }
    const scored: { card: Card; sim: number }[] = [];
    for (const id of bucket) {
      const card = this.cards.get(id);
      if (!card?.embedding) {
        continue;
      }
      const sim = cosine(qVec, card.embedding);
      if (sim > 0) {
        scored.push({ card, sim });
      }
    }
    scored.sort((a, b) => b.sim - a.sim);
    return scored.slice(0, limit).map(s => s.card);

    function cosine(a: number[], b: number[]) {
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

  recordCardUsage(cardId: string) {
    const stat = this.usageStats.get(cardId) || { count: 0, lastOpened: null };
    stat.count++;
    stat.lastOpened = Date.now();
    this.usageStats.set(cardId, stat);
    this._debouncedSmartDecks();
  }

  async _setDeckCards(deckName: string, ids: Set<string>) {
    const deck = this.getDeck(deckName);
    const oldIds = new Set(deck.cards);
    const pending: Promise<void>[] = [];
    let changed = false;
    for (const id of oldIds) {
      if (!ids.has(id)) {
        deck.cards.delete(id);
        const card = this.cards.get(id);
        if (card) {
          card.decks.delete(deck.name);
          this.emit('cardUpdated', card);
          pending.push(this._persistCard(card));
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
          pending.push(this._persistCard(card));
        }
        changed = true;
      }
    }
    if (pending.length) {
      await Promise.all(pending);
    }
    if (changed) {
      this.emit('deckUpdated', deck);
    }
  }

  _updateSmartDecks() {
    // Single pass over all cards — builds all smart deck sets simultaneously
    const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const staleCutoff  = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentIds = new Set<string>();
    const unseenIds = new Set<string>();
    const staleIds  = new Set<string>();

    for (const card of this.cards.values()) {
      const stat = this.usageStats.get(card.id);
      if (new Date(card.createdAt).getTime() >= recentCutoff) recentIds.add(card.id);
      if (!stat || stat.count === 0) unseenIds.add(card.id);
      if (!stat || !stat.lastOpened || stat.lastOpened < staleCutoff) staleIds.add(card.id);
    }

    const frequentIds = new Set<string>(
      Array.from(this.usageStats.entries())
        .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
        .slice(0, 5)
        .map(([id]) => id)
    );

    this._setDeckCards('recent',   recentIds);
    this._setDeckCards('frequent', frequentIds);
    this._setDeckCards('unseen',   unseenIds);
    this._setDeckCards('stale',    staleIds);

    // Tag decks
    for (const [tag, set] of this.tagIndex.entries()) {
      const deckName = `tag:${tag}`;
      if (set.size >= 2) this._setDeckCards(deckName, set);
      else if (this.decks.has(deckName)) this.removeDeck(deckName);
    }
    for (const name of Array.from(this.decks.keys())) {
      if (name.startsWith('tag:') && !this.tagIndex.has(name.slice(4))) this.removeDeck(name);
    }
  }

  /** Debounce smart deck rebuilds — coalesce rapid mutations into one update */
  private _debouncedSmartDecks() {
    this.lastModified = Date.now();
    this._jsonCache = null;
    if (this._smartDeckTimer) clearTimeout(this._smartDeckTimer);
    this._smartDeckTimer = setTimeout(() => {
      this._smartDeckTimer = null;
      this._updateSmartDecks();
    }, 500);
  }

  /** Force-flush pending smart deck update (for tests / shutdown) */
  flushSmartDecks() {
    if (this._smartDeckTimer) {
      clearTimeout(this._smartDeckTimer);
      this._smartDeckTimer = null;
      this._updateSmartDecks();
    }
  }

  _addToTagIndex(card: Card) {
    for (const tag of card.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set<string>());
      }
      this.tagIndex.get(tag)!.add(card.id);
    }
  }

  _removeFromTagIndex(card: Card) {
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

  _updateTagIndex(card: Card, oldTags: Set<string> = new Set()) {
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
    if (this.embeddingDim === 0) {
      const sample = Array.from(this.cards.values()).find(c => c.embedding)?.embedding;
      if (sample) {
        this._initLSH(sample.length);
      }
    }
    if (this.embeddingDim > 0) {
      this.lshBuckets.clear();
      this.cardBuckets.clear();
      for (const card of this.cards.values()) {
        if (card.embedding && card.embedding.length === this.embeddingDim) {
          const h = this._hashEmbedding(card.embedding);
          this.cardBuckets.set(card.id, h);
          let bucket = this.lshBuckets.get(h);
          if (!bucket) {
            bucket = new Set();
            this.lshBuckets.set(h, bucket);
          }
          bucket.add(card.id);
        }
      }
    }
    this._jsonCache = null;
  }

  /** Incremental Fuse update — avoids full collection rebuild */
  private _fuseAddCard(card: Card) {
    this.fuse.add(card);
    this._jsonCache = null;
  }

  private _fuseRemoveCard(card: Card) {
    this.fuse.remove(doc => doc.id === card.id);
    this._jsonCache = null;
  }

  private _fuseUpdateCard(card: Card) {
    this.fuse.remove(doc => doc.id === card.id);
    this.fuse.add(card);
    this._jsonCache = null;
  }

  _initLSH(dim: number) {
    if (this.embeddingDim > 0) return; // Already initialized, prevent race condition
    this.embeddingDim = dim;
    this.lshPlanes = [];
    for (let i = 0; i < 10; i++) {
      const plane: number[] = [];
      for (let j = 0; j < dim; j++) {
        plane.push(Math.random() * 2 - 1);
      }
      this.lshPlanes.push(plane);
    }
  }

  _hashEmbedding(vec: number[]) {
    return this.lshPlanes
      .map(p => {
        let dot = 0;
        for (let i = 0; i < p.length && i < vec.length; i++) {
          dot += p[i] * vec[i];
        }
        return dot >= 0 ? '1' : '0';
      })
      .join('');
  }

  _addToLSH(card: Card) {
    if (!card.embedding) {
      return;
    }
    if (this.embeddingDim === 0) {
      this._initLSH(card.embedding.length);
    }
    if (card.embedding.length !== this.embeddingDim) {
      return;
    }
    const h = this._hashEmbedding(card.embedding);
    this.cardBuckets.set(card.id, h);
    let bucket = this.lshBuckets.get(h);
    if (!bucket) {
      bucket = new Set();
      this.lshBuckets.set(h, bucket);
    }
    bucket.add(card.id);
  }

  _removeFromLSH(id: string) {
    const h = this.cardBuckets.get(id);
    if (!h) {
      return;
    }
    const bucket = this.lshBuckets.get(h);
    bucket?.delete(id);
    if (bucket && bucket.size === 0) {
      this.lshBuckets.delete(h);
    }
    this.cardBuckets.delete(id);
  }

  private async _fetchSuggestionsForTags(tags: Iterable<string>, cardType?: string, limit = 3) {
    if (limit <= 0) {
      return [];
    }
    const seen = new Set<string>();
    const pending: Promise<any>[] = [];
    for (const rawTag of tags) {
      if (pending.length >= limit) {
        break;
      }
      const tag = String(rawTag || '').trim();
      if (!tag || seen.has(tag)) {
        continue;
      }
      seen.add(tag);
      pending.push(fetchSuggestion(tag, cardType));
    }
    if (pending.length === 0) {
      return [];
    }
    const results = await Promise.all(pending);
    return results.filter(Boolean);
  }

  async getCardSuggestions(cardId: string, limit = 3) {
    if (!this.webSuggestionsEnabled) {
      return [];
    }
    const card = this.cards.get(cardId);
    if (!card) {
      return [];
    }
    return this._fetchSuggestionsForTags(card.tags, card.type, limit);
  }

  async getThemeSuggestions(limit = 3) {
    if (!this.webSuggestionsEnabled) {
      return [];
    }
    const counts = new Map<string, number>();
    for (const card of this.cards.values()) {
      for (const tag of card.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const ordered = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
    return this._fetchSuggestionsForTags(ordered, undefined, limit);
  }

  async getWebSuggestions(limit = 3) {
    // backward compatibility: alias to theme suggestions
    return this.getThemeSuggestions(limit);
  }

  removeCard(cardId: string) {
    const card = this.cards.get(cardId);
    if (!card) {
      return false;
    }
    const deckNames = Array.from(card.decks);
    for (const deckName of deckNames) {
      this.removeCardFromDeck(card.id, deckName);
    }
    // remove links involving this card
    const linkIds = this.linksByCard.get(cardId);
    if (linkIds) {
      for (const id of Array.from(linkIds)) {
        this.removeLink(id);
      }
    }
    this.cards.delete(cardId);
    this._removeFromLSH(cardId);
    this._removeFromTagIndex(card);
    this._fuseRemoveCard(card);
    this.emit('cardRemoved', card);
    void this._deleteCardRecord(cardId);
    this._debouncedSmartDecks();
    return true;
  }

  removeDeck(deckName: string) {
    const norm = this._normalizeDeckName(deckName);
    if (!norm) {
      return false;
    }
    const deck = this.decks.get(norm);
    if (!deck) {
      return false;
    }
    for (const cardId of Array.from(deck.cards)) {
      const card = this.cards.get(cardId);
      if (card) {
        deck.removeCard(card);
        this.emit('cardUpdated', card);
        void this._persistCard(card);
      }
    }
    this.decks.delete(norm);
    this.emit('deckRemoved', norm);
    return true;
  }

  private _linkKey(from: string, to: string, type: string) {
    return `${from}\0${to}\0${type}`;
  }

  _indexLink(link: Link) {
    this.linksByEndpoints.add(this._linkKey(link.from, link.to, link.type));
    if (!this.linksByCard.has(link.from)) {
      this.linksByCard.set(link.from, new Set<string>());
    }
    this.linksByCard.get(link.from)!.add(link.id);
    if (!this.linksByCard.has(link.to)) {
      this.linksByCard.set(link.to, new Set<string>());
    }
    this.linksByCard.get(link.to)!.add(link.id);
  }

  _unindexLink(link: Link) {
    this.linksByEndpoints.delete(this._linkKey(link.from, link.to, link.type));
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

  createLink(fromId: string, toId: string, type = 'related', annotation = '') {
    if (fromId === toId) {
      throw new Error('Cannot link card to itself');
    }
    const from = this.cards.get(fromId);
    const to = this.cards.get(toId);
    if (!from || !to) {
      throw new Error('Both cards must exist to create a link');
    }
    const normType = this._normalizeTag(type ?? 'related') || 'related';
    if (this.linksByEndpoints.has(this._linkKey(fromId, toId, normType))) {
      throw new Error('Link already exists');
    }
    const id = String(this.nextLinkId++);
    const link = new Link({ id, from: fromId, to: toId, type: normType, annotation });
    this.links.set(id, link);
    this._indexLink(link);
    void this._persistLink(link);
    this.emit('linkCreated', link);
    return link;
  }

  updateLink(linkId: string, data: { type?: string; annotation?: string }) {
    const link = this.links.get(linkId);
    if (!link) {
      return null;
    }
    const nextType = data.type !== undefined ? (this._normalizeTag(data.type) || link.type) : link.type;
    if (nextType !== link.type && this.linksByEndpoints.has(this._linkKey(link.from, link.to, nextType))) {
      throw new Error('Link already exists');
    }
    const oldType = link.type;
    link.update({
      type: data.type !== undefined ? nextType : undefined,
      annotation: data.annotation,
    });
    if (oldType !== link.type) {
      this.linksByEndpoints.delete(this._linkKey(link.from, link.to, oldType));
      this.linksByEndpoints.add(this._linkKey(link.from, link.to, link.type));
    }
    void this._persistLink(link);
    this.emit('linkUpdated', link);
    return link;
  }

  getLinks(cardId: string) {
    const ids = this.linksByCard.get(cardId);
    if (!ids) {
      return [];
    }
    const results: Link[] = [];
    for (const id of ids) {
      const link = this.links.get(id);
      if (link) {
        results.push(link);
      }
    }
    return results;
  }

  getLinkedCardIds(cardId: string) {
    const ids = this.linksByCard.get(cardId);
    if (!ids) {
      return [];
    }
    const result = new Set<string>();
    for (const id of ids) {
      const link = this.links.get(id);
      if (link) {
        result.add(link.from === cardId ? link.to : link.from);
      }
    }
    return Array.from(result);
  }

  removeLink(linkId: string) {
    const link = this.links.get(linkId);
    const res = this.links.delete(linkId);
    if (res && link) {
      this._unindexLink(link);
      void this._deleteLinkRecord(linkId);
      this.emit('linkRemoved', link);
    }
    return res;
  }

  getGraph(options: string | { deck?: string; tag?: string; linkType?: string } = {}) {
    let deckName: string | null = null;
    let tagFilter: string | null = null;
    let linkTypeFilter: string | null = null;
    if (typeof options === 'string') {
      const normalized = this._normalizeDeckName(options);
      deckName = normalized || null;
    } else {
      const normalizedDeck = options.deck ? this._normalizeDeckName(options.deck) : '';
      deckName = normalizedDeck || null;
      const normalizedTag = options.tag ? this._normalizeTag(options.tag) : '';
      tagFilter = normalizedTag || null;
      const normalizedType = options.linkType ? this._normalizeTag(options.linkType) : '';
      linkTypeFilter = normalizedType || null;
    }

    let cardIds: Set<string>;
    if (deckName) {
      const deck = this.decks.get(deckName);
      if (!deck) {
        return { nodes: [], edges: [] };
      }
      cardIds = new Set(deck.cards);
    } else {
      cardIds = new Set(this.cards.keys());
    }

    const nodes: Array<{ id: string; title: string; tags: string[]; decks: string[] }> = [];
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

    const includedIds = new Set<string>(nodes.map(n => n.id));

    const edges: Array<{ id: string; from: string; to: string; type: string; annotation: string }> = [];
    const seen = new Set<string>();
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

  async processCard(card: Card) {
    const tasks: Array<[string, Promise<unknown>]> = [];
    if (!card.summary) {
      tasks.push(['summary', this._runAI('summarizeCard', card)]);
    }
    if (!card.illustration) {
      tasks.push(['illustration', this._runAI('generateIllustration', card.title)]);
    }
    if (tasks.length === 0) {
      return;
    }
    const results = await Promise.allSettled(tasks.map(([, p]) => p));
    for (let i = 0; i < results.length; i++) {
      const [key] = tasks[i];
      const r = results[i];
      if (r.status === 'fulfilled') {
        (card as unknown as Record<string, unknown>)[key] = r.value;
      } else {
        this.emit('error', r.reason);
      }
    }
  }

  async summarize(text: string) {
    return this.ai.summarize(text);
  }

  async summarizeCard(card: Card) {
    if (this.ai.summarizeCard) {
      return this.ai.summarizeCard(card);
    }
    const text = card.content || card.source || card.title;
    return this.summarize(text);
  }

  async generateIllustration(title: string) {
    return this.ai.generateIllustration(title);
  }

  async chat(query: string) {
    if (!this.aiEnabled) {
      return 'AI disabled';
    }
    return this.ai.chat(query, this);
  }

  private _createFuse() {
    return new Fuse<Card>([], {
      keys: ['title', 'content', 'description', 'tags'],
      includeMatches: true,
      includeScore: true,
    });
  }

  private _resetToEmptyState() {
    this.cards = new Map();
    this.decks = new Map();
    this.links = new Map();
    this.linksByCard = new Map();
    this.linksByEndpoints = new Set();
    this.tagIndex = new Map();
    this.usageStats = new Map();
    this.cardBuckets = new Map();
    this.lshBuckets = new Map();
    this.lshPlanes = [];
    this.embeddingDim = 0;
    this.nextId = 1;
    this.nextLinkId = 1;
    this.fuse = this._createFuse();
    this.workerTasks = new Map();
    this.workerSeq = 0;
  }

  private _applySnapshot(data: Record<string, unknown>, { reset = false }: { reset?: boolean } = {}) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid snapshot data');
    }
    this._resetToEmptyState();

    for (const cardData of (data.cards as CardData[]) || []) {
      const copy = { ...cardData } as CardData & { id: string };
      copy.tags = this._normalizeTagList(copy.tags);
      copy.decks = this._normalizeDeckList(copy.decks);
      const card = new Card(copy);
      this.cards.set(card.id, card);
      this._addToTagIndex(card);
      if (card.embedding) {
        this._addToLSH(card);
      }
      const num = Number(card.id);
      if (!Number.isNaN(num) && num >= this.nextId) {
        this.nextId = num + 1;
      }
    }

    for (const deckData of (data.decks as Array<{ name: string; cards?: string[] }>) || []) {
      if (!deckData || !deckData.name) {
        continue;
      }
      const name = this._normalizeDeckName(String(deckData.name));
      if (!name) {
        continue;
      }
      let deck = this.decks.get(name);
      if (!deck) {
        deck = new Deck(name);
        this.decks.set(name, deck);
      }
      for (const cardId of deckData.cards || []) {
        const card = this.cards.get(cardId);
        if (!card || deck.cards.has(card.id)) {
          continue;
        }
        deck.addCard(card);
      }
    }

    for (const card of this.cards.values()) {
      for (const deckName of card.decks) {
        let deck = this.decks.get(deckName);
        if (!deck) {
          deck = new Deck(deckName);
          this.decks.set(deckName, deck);
        }
        if (!deck.cards.has(card.id)) {
          deck.addCard(card);
        }
      }
    }

    for (const linkData of (data.links as Array<{ id: string; from: string; to: string; type?: string; annotation?: string }>) || []) {
      if (!linkData) {
        continue;
      }
      const from = linkData.from;
      const to = linkData.to;
      if (!this.cards.has(from) || !this.cards.has(to)) {
        continue;
      }
      const link = new Link({
        id: linkData.id,
        from,
        to,
        type: (linkData.type || 'related').toLowerCase(),
        annotation: linkData.annotation,
      });
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

  async loadSnapshot(data: Record<string, unknown>) {
    this._applySnapshot(data, { reset: true });
    if (this.db) {
      const cards = Array.from(this.cards.values()).map(card => ({
        id: card.id,
        title: card.title,
        content: card.content,
        source: card.source,
        tags: card.tags,
        decks: card.decks,
        type: card.type,
        description: card.description,
        createdAt: card.createdAt,
        summary: card.summary,
        illustration: card.illustration,
        embedding: card.embedding ?? null,
      }));
      const links = Array.from(this.links.values()).map(link => ({
        id: link.id,
        from: link.from,
        to: link.to,
        type: link.type,
        annotation: link.annotation,
      }));
      await this.db.replaceAll(cards, links);
    }
  }

  private _buildJSON() {
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
      lastModified: this.lastModified,
    };
  }

  /** Cached serialization — invalidated automatically on mutations */
  toJSON() {
    if (!this._jsonCache) {
      this._jsonCache = this._buildJSON();
    }
    return this._jsonCache;
  }

  /** Batch-create cards — defers index rebuilds to the end */
  async createCards(items: CardData[]) {
    const created: Card[] = [];
    for (const data of items) {
      if (!data.id) {
        data.id = String(this.nextId++);
      } else {
        const num = Number(data.id);
        if (!Number.isNaN(num) && num >= this.nextId) {
          this.nextId = num + 1;
        }
      }
      if (this.cards.has(data.id)) continue;
      if (data.tags) data.tags = this._normalizeTagList(data.tags);
      if (data.decks) data.decks = this._normalizeDeckList(data.decks);
      const card = new Card(data as Omit<CardData, 'id'> & { id: string });
      this.cards.set(card.id, card);
      this._addToTagIndex(card);
      created.push(card);
    }
    // Process all cards (embedding, summarize, persist)
    await Promise.all(created.map(card => this._processAndPersistCard(card)));
    // Add to decks
    for (const card of created) {
      for (const deckName of Array.from(card.decks)) {
        this.addCardToDeck(card.id, deckName);
      }
      this.emit('cardCreated', card);
    }
    // Rebuild once at the end
    this._rebuildSearchIndex();
    this._updateSmartDecks();
    return created;
  }

  /** Text search with match context highlighting */
  searchByTextWithHighlights(query: string, limit = 20) {
    const results = this.fuse.search(query, { limit });
    return results.map(r => ({
      card: r.item,
      score: r.score ?? 1,
      matches: (r.matches || []).map(m => ({
        key: m.key,
        value: m.value,
        indices: m.indices,
      })),
    }));
  }

  /** Paginated card listing */
  getCards(offset = 0, limit = 50) {
    const all = Array.from(this.cards.values());
    return {
      cards: all.slice(offset, offset + limit).map(c => c.toJSON()),
      total: all.length,
      offset,
      limit,
    };
  }

  async saveToFile(path: string) {
    await fs.promises.writeFile(path, JSON.stringify(this.toJSON(), null, 2));
  }

  async saveEncryptedToFile(path: string, password: string) {
    const iv = crypto.randomBytes(12);
    const key = crypto.createHash('sha256').update(password).digest();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const json = Buffer.from(JSON.stringify(this.toJSON()));
    const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
    const tag = cipher.getAuthTag();
    await fs.promises.writeFile(path, Buffer.concat([iv, tag, encrypted]));
  }

  async saveMedia(input: string | Buffer, filename: string) {
    const dir = 'storage';
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    if (typeof input === 'string') {
      if (this.encryptionKey) {
        const buffer = await fs.promises.readFile(input);
        await fs.promises.unlink(input).catch(() => {});
        return this.saveMedia(buffer, filename);
      }
      await fs.promises.rename(input, filePath);
      return filePath;
    }
    let data = input;
    if (this.encryptionKey) {
      const iv = crypto.randomBytes(12);
      const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
      const tag = cipher.getAuthTag();
      data = Buffer.concat([iv, tag, encrypted]);
    }
    await fs.promises.writeFile(filePath, data);
    return filePath;
  }

  async loadMedia(filePath: string) {
    let data = await fs.promises.readFile(filePath);
    if (this.encryptionKey) {
      const iv = data.subarray(0, 12);
      const tag = data.subarray(12, 28);
      const encrypted = data.subarray(28);
      const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
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

  async exportZip(zipPath: string) {
    const buffer = await this.exportZipBuffer();
    await fs.promises.writeFile(zipPath, buffer);
  }

  static async importZipBuffer(buffer: Buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const json = JSON.parse(await zip.file('data.json')!.async('string'));
    const app = MemoryApp.fromJSON(json);
    const dir = 'storage';
    await fs.promises.mkdir(dir, { recursive: true });
    const media = Object.keys(zip.files).filter(
      n => n.startsWith('media/') && !zip.files[n].dir
    );
    for (const name of media) {
      const content = await zip.file(name)!.async('nodebuffer');
      const fname = name.replace('media/', '');
      await fs.promises.writeFile(path.join(dir, fname), content);
    }
    return app;
  }

  static async importZip(zipPath: string) {
    const buffer = await fs.promises.readFile(zipPath);
    return MemoryApp.importZipBuffer(buffer);
  }

  static fromJSON(data: Record<string, unknown>) {
    const app = new MemoryApp();
    app.aiEnabled = false;
    app._applySnapshot(data, { reset: true });
    return app;
  }

  static async loadFromFile(path: string) {
    const data = JSON.parse(await fs.promises.readFile(path, 'utf8'));
    return MemoryApp.fromJSON(data);
  }

  static async loadEncryptedFromFile(path: string, password: string) {
    const data = await fs.promises.readFile(path);
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const encrypted = data.slice(28);
    const key = crypto.createHash('sha256').update(password).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
    return MemoryApp.fromJSON(JSON.parse(json));
  }

  async loadFromDB() {
    if (!this.db) return;
    const stored = await this.db.loadCards();
    for (const data of stored) {
      const cardData = {
        ...data,
        tags: this._normalizeTagList(data.tags),
        decks: this._normalizeDeckList(data.decks),
        embedding: data.embedding ?? undefined,
      };
      const card = new Card(cardData as Omit<CardData, 'id'> & { id: string });
      this.cards.set(card.id, card);
      this._addToTagIndex(card);
      if (card.embedding) {
        this._addToLSH(card);
      }
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
