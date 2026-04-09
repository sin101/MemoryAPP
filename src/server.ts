import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import MemoryApp from './app.js';
import { z } from 'zod';
import { createServer } from 'http';
import { config } from './config.js';
import { fetchUrlMeta } from './urlFetcher.js';

export const clients = new Set<express.Response>();

const ENC_KEY = config.ENCRYPTION_KEY || '';
export const app = new MemoryApp({ dbPath: config.DB_PATH, encryptionKey: ENC_KEY, logPath: config.LOG_PATH });
const API_TOKEN = config.API_TOKEN || '';

const api = express();
api.use(helmet());
api.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: config.RATE_LIMIT_MAX || 100
  })
);
api.use(cors());
api.use(express.json({ limit: '10mb' }));

api.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  clients.add(res);
  req.on('close', () => {
    clients.delete(res);
  });
});

export function broadcast(event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of Array.from(clients)) {
    if (client.writableEnded) {
      clients.delete(client);
      continue;
    }
    try {
      client.write(msg);
    } catch {
      clients.delete(client);
    }
  }
}

const HEARTBEAT_MS = 30_000;
setInterval(() => {
  for (const client of Array.from(clients)) {
    if (client.writableEnded) {
      clients.delete(client);
      continue;
    }
    try {
      client.write(':\n\n');
    } catch {
      clients.delete(client);
    }
  }
}, HEARTBEAT_MS).unref();

app.on('cardCreated', c => broadcast('cardCreated', c));
app.on('cardUpdated', c => broadcast('cardUpdated', c));
app.on('cardRemoved', c => broadcast('cardRemoved', c));
app.on('cardProcessed', c => broadcast('cardProcessed', c));
app.on('deckRemoved', name => broadcast('deckRemoved', name));
app.on('deckCreated', deck => broadcast('deckCreated', { name: deck.name, cards: Array.from(deck.cards) }));
app.on('deckUpdated', deck => broadcast('deckUpdated', { name: deck.name, cards: Array.from(deck.cards) }));
app.on('linkCreated', link => broadcast('linkCreated', link));
app.on('linkUpdated', link => broadcast('linkUpdated', link));
app.on('linkRemoved', link => broadcast('linkRemoved', link));

api.use((req, res, next) => {
  if (!API_TOKEN) return next();
  const auth = req.headers['authorization'] || '';
  const expected = `Bearer ${API_TOKEN}`;
  if (auth.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return next();
  }
  res.status(401).send('Unauthorized');
});

const cardSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  decks: z.array(z.string()).optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  summary: z.string().optional(),
  illustration: z.string().optional(),
});

const illustrateSchema = z.object({ prompt: z.string() });
const usageParams = z.object({ id: z.string() });
const settingsSchema = z.object({
  aiEnabled: z.boolean().optional(),
  webSuggestionsEnabled: z.boolean().optional(),
  externalCallsEnabled: z.boolean().optional(),
  backgroundProcessing: z.boolean().optional(),
});
const semanticSchema = z.object({ query: z.string(), limit: z.number().optional() });
const linkSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.string().optional(),
  annotation: z.string().optional(),
});
const linkUpdateSchema = z.object({
  type: z.string().optional(),
  annotation: z.string().optional(),
});
const linkParams = z.object({ id: z.string() });
const chatSchema = z.object({ query: z.string() });
const deckCreateSchema = z.object({ name: z.string() });
const deckParams = z.object({ name: z.string() });
const deckCardBody = z.object({ cardId: z.string() });
const deckCardParams = z.object({ name: z.string(), cardId: z.string() });
const limitQuerySchema = z.object({ limit: z.string().optional() });
const paginationSchema = z.object({
  offset: z.string().optional(),
  limit: z.string().optional(),
});
const textSearchSchema = z.object({ query: z.string(), limit: z.number().optional() });
const batchCardsSchema = z.object({ cards: z.array(cardSchema) });

api.post('/api/cards', async (req, res, next) => {
  try {
    const data = cardSchema.parse(req.body);
    const card = await app.createCard(data);
    res.json(card);
  } catch (e) {
    next(e);
  }
});

api.post('/api/cards/batch', async (req, res, next) => {
  try {
    const { cards } = batchCardsSchema.parse(req.body);
    const created = await app.createCards(cards);
    res.json(created);
  } catch (e) {
    next(e);
  }
});

api.get('/api/cards', (req, res) => {
  const { offset, limit } = paginationSchema.parse(req.query);
  const o = offset ? parseInt(offset, 10) : undefined;
  const l = limit ? parseInt(limit, 10) : undefined;
  if (o !== undefined || l !== undefined) {
    res.json(app.getCards(o, l));
  } else {
    res.json(app.toJSON());
  }
});

api.get('/api/cards/:id', (req, res, next) => {
  try {
    const { id } = usageParams.parse(req.params);
    const card = app.cards.get(id);
    if (!card) {
      res.status(404).send('Not found');
      return;
    }
    res.json(card.toJSON());
  } catch (e) {
    next(e);
  }
});

api.put('/api/cards/:id', async (req, res, next) => {
  try {
    const { id } = usageParams.parse(req.params);
    const data = cardSchema.parse(req.body);
    const card = await app.updateCard(id, data);
    if (!card) {
      res.status(404).send('Not found');
      return;
    }
    res.json(card.toJSON());
  } catch (e) {
    next(e);
  }
});

api.delete('/api/cards/:id', (req, res, next) => {
  try {
    const { id } = usageParams.parse(req.params);
    const removed = app.removeCard(id);
    if (!removed) {
      res.status(404).send('Not found');
      return;
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

api.post('/api/decks', (req, res, next) => {
  try {
    const { name } = deckCreateSchema.parse(req.body);
    const deck = app.getDeck(name);
    res.json({ name: deck.name, cards: Array.from(deck.cards), size: deck.cards.size });
  } catch (e) {
    next(e);
  }
});

api.get('/api/decks', (_req, res) => {
  res.json(app.listDecks());
});

api.get('/api/decks/:name', (req, res, next) => {
  try {
    const { name } = deckParams.parse(req.params);
    const deck = app.getDeckSnapshot(name);
    if (!deck) {
      res.status(404).send('Not found');
      return;
    }
    res.json(deck);
  } catch (e) {
    next(e);
  }
});

api.post('/api/decks/:name/cards', (req, res, next) => {
  try {
    const { name } = deckParams.parse(req.params);
    const { cardId } = deckCardBody.parse(req.body);
    const deck = app.addCardToDeck(cardId, name);
    res.json({ name: deck.name, cards: Array.from(deck.cards), size: deck.cards.size });
  } catch (e) {
    next(e);
  }
});

api.delete('/api/decks/:name/cards/:cardId', (req, res, next) => {
  try {
    const { name, cardId } = deckCardParams.parse(req.params);
    const removed = app.removeCardFromDeck(cardId, name);
    if (!removed) {
      res.status(404).send('Not found');
      return;
    }
    const deck = app.getDeckSnapshot(name);
    if (!deck) {
      res.status(204).send();
      return;
    }
    res.json(deck);
  } catch (e) {
    next(e);
  }
});

api.delete('/api/decks/:name', (req, res, next) => {
  try {
    const { name } = deckParams.parse(req.params);
    const removed = app.removeDeck(name);
    if (!removed) {
      res.status(404).send('Not found');
      return;
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

api.post('/api/illustrate', async (req, res, next) => {
  try {
    const { prompt } = illustrateSchema.parse(req.body);
    const image = await app.generateIllustration(prompt);
    res.json({ image });
  } catch (e) {
    next(e);
  }
});

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const audioSchema = z.object({
  audio: z.string().max(MAX_UPLOAD_BYTES),
  title: z.string().optional(),
  contentType: z.string().optional(),
  duration: z.number().optional(),
});

api.post('/api/audio-note', async (req, res, next) => {
  try {
    const data = audioSchema.parse(req.body);
    const file = `audio-${Date.now()}.webm`;
    await fs.writeFile(file, Buffer.from(data.audio, 'base64'));
    try {
      const card = await app.createAudioNote(file, {
        title: data.title || 'Audio note',
        contentType: data.contentType,
        duration: data.duration,
      });
      res.json(card);
    } finally {
      await fs.unlink(file).catch(() => {});
    }
  } catch (e) {
    next(e);
  }
});

const videoSchema = z.object({
  video: z.string().max(MAX_UPLOAD_BYTES),
  title: z.string().optional(),
});

api.post('/api/video-note', async (req, res, next) => {
  try {
    const data = videoSchema.parse(req.body);
    const file = `video-${Date.now()}.webm`;
    await fs.writeFile(file, Buffer.from(data.video, 'base64'));
    try {
      const card = await app.createVideoNote(file, { title: data.title || 'Video note' });
      res.json(card);
    } finally {
      await fs.unlink(file).catch(() => {});
    }
  } catch (e) {
    next(e);
  }
});

const clipSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  content: z.string().optional(),
  screenshot: z.string().optional(),
  decks: z.array(z.string()).optional(),
});

api.post('/api/clip', async (req, res, next) => {
  try {
    const data = clipSchema.parse(req.body);
    let meta;
    try {
      meta = await fetchUrlMeta(data.url);
    } catch {
      meta = null;
    }
    const cardData: import('./types.js').CardData = {
      title: data.title || meta?.title || data.url,
      source: data.url,
      content: data.content || meta?.videoId || meta?.description || '',
      description: meta?.description,
      type: meta?.type || 'link',
      decks: data.decks,
    };
    if (data.screenshot) {
      cardData.illustration = data.screenshot;
    } else if (meta?.image) {
      cardData.illustration = meta.image;
    }
    const card = await app.createCard(cardData);
    res.json(card);
  } catch (e) {
    next(e);
  }
});

const fetchUrlSchema = z.object({ url: z.string().url() });

api.get('/api/fetch-url', async (req, res, next) => {
  try {
    const { url } = fetchUrlSchema.parse({ url: req.query.url });
    const meta = await fetchUrlMeta(url);
    res.json(meta);
  } catch (e) {
    next(e);
  }
});

api.get('/api/graph', (req, res, next) => {
  try {
    const deck = typeof req.query.deck === 'string' ? req.query.deck : undefined;
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    const linkType = typeof req.query.linkType === 'string' ? req.query.linkType : undefined;
    const graph = app.getGraph({ deck, tag, linkType });
    res.json(graph);
  } catch (e) {
    next(e);
  }
});

api.post('/api/search/text', (req, res, next) => {
  try {
    const { query, limit } = textSearchSchema.parse(req.body);
    const results = app.searchByTextWithHighlights(query, limit);
    res.json(results.map(r => ({
      card: r.card.toJSON(),
      score: r.score,
      matches: r.matches,
    })));
  } catch (e) {
    next(e);
  }
});

api.post('/api/search/semantic', async (req, res, next) => {
  try {
    const { query, limit } = semanticSchema.parse(req.body);
    const results = await app.searchBySemantic(query, limit);
    res.json(results);
  } catch (e) {
    next(e);
  }
});

api.get('/api/cards/:id/suggestions', async (req, res, next) => {
  try {
    const { id } = usageParams.parse(req.params);
    const { limit } = limitQuerySchema.parse(req.query);
    const parsed = limit ? parseInt(limit, 10) : 3;
    const clamped = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 10) : 3;
    const suggestions = await app.getCardSuggestions(id, clamped);
    res.json(suggestions);
  } catch (e) {
    next(e);
  }
});

api.get('/api/suggestions/themes', async (req, res, next) => {
  try {
    const { limit } = limitQuerySchema.parse(req.query);
    const parsed = limit ? parseInt(limit, 10) : 3;
    const clamped = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 10) : 3;
    const suggestions = await app.getThemeSuggestions(clamped);
    res.json(suggestions);
  } catch (e) {
    next(e);
  }
});

api.get('/api/suggestions/web', async (req, res, next) => {
  try {
    const { limit } = limitQuerySchema.parse(req.query);
    const parsed = limit ? parseInt(limit, 10) : 3;
    const clamped = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 10) : 3;
    const suggestions = await app.getWebSuggestions(clamped);
    res.json(suggestions);
  } catch (e) {
    next(e);
  }
});

api.post('/api/settings', (req, res, next) => {
  try {
    const { aiEnabled, webSuggestionsEnabled, externalCallsEnabled, backgroundProcessing } = settingsSchema.parse(req.body);
    if (externalCallsEnabled !== undefined) {
      app.setExternalCallsEnabled(externalCallsEnabled);
    }
    if (aiEnabled !== undefined) {
      app.setAIEnabled(aiEnabled);
    }
    if (webSuggestionsEnabled !== undefined) {
      app.setWebSuggestionsEnabled(webSuggestionsEnabled);
    }
    if (backgroundProcessing !== undefined) {
      app.setBackgroundProcessing(backgroundProcessing);
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

api.post('/api/links', (req, res, next) => {
  try {
    const data = linkSchema.parse(req.body);
    const link = app.createLink(data.from, data.to, data.type, data.annotation);
    res.json({ id: link.id, from: link.from, to: link.to, type: link.type, annotation: link.annotation });
  } catch (e) {
    next(e);
  }
});

api.put('/api/links/:id', (req, res, next) => {
  try {
    const { id } = linkParams.parse(req.params);
    const data = linkUpdateSchema.parse(req.body);
    const link = app.updateLink(id, data);
    if (!link) {
      res.status(404).send('Not found');
      return;
    }
    res.json({ id: link.id, from: link.from, to: link.to, type: link.type, annotation: link.annotation });
  } catch (e) {
    next(e);
  }
});

api.delete('/api/links/:id', (req, res, next) => {
  try {
    const { id } = linkParams.parse(req.params);
    const removed = app.removeLink(id);
    if (!removed) {
      res.status(404).send('Not found');
      return;
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

api.post('/api/chat', async (req, res, next) => {
  try {
    const { query } = chatSchema.parse(req.body);
    const answer = await app.chat(query);
    res.json({ answer });
  } catch (e) {
    next(e);
  }
});

api.post('/api/cards/:id/usage', (req, res, next) => {
  try {
    const { id } = usageParams.parse(req.params);
    app.recordCardUsage(id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

api.get('/api/sync/status', (_req, res) => {
  res.json({
    lastModified: app.lastModified,
    cardCount: app.cards.size,
    linkCount: app.links.size,
  });
});

api.get('/api/export/json', (_req, res) => {
  res.json(app.toJSON());
});

api.get('/api/export/zip', async (_req, res, next) => {
  try {
    const buffer = await app.exportZipBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="memoryapp-export.zip"');
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

api.post('/api/import/json', async (req, res, next) => {
  try {
    await app.loadSnapshot(req.body);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

api.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).send(err.message || 'Error');
});

export const server = createServer(api);

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => console.log(`Server listening on ${PORT}`));
}
