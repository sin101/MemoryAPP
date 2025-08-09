import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { promises as fs } from 'fs';
import MemoryApp from './app.js';
import { z } from 'zod';
import { createServer } from 'http';
import { config } from './config.js';

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

api.use((req, res, next) => {
  if (!API_TOKEN) return next();
  const auth = req.headers['authorization'] || '';
  if (auth === `Bearer ${API_TOKEN}`) return next();
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

api.post('/api/cards', async (req, res, next) => {
  try {
    const data = cardSchema.parse(req.body);
    const card = await app.createCard(data as any);
    res.json(card);
  } catch (e) {
    next(e);
  }
});

api.get('/api/cards', (_req, res) => {
  res.json(app.toJSON());
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

const audioSchema = z.object({
  audio: z.string(),
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
  video: z.string(),
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
  url: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  screenshot: z.string().optional(),
});

api.post('/api/clip', async (req, res, next) => {
  try {
    const data = clipSchema.parse(req.body);
    const cardData: any = {
      title: data.title || data.url,
      source: data.url,
      content: data.content || '',
      type: 'link',
    };
    if (data.screenshot) {
      cardData.illustration = data.screenshot;
    }
    const card = await app.createCard(cardData);
    res.json(card);
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

api.post('/api/settings', (req, res, next) => {
  try {
    const { aiEnabled, webSuggestionsEnabled } = settingsSchema.parse(req.body);
    if (aiEnabled !== undefined) app.setAIEnabled(aiEnabled);
    if (webSuggestionsEnabled !== undefined) {
      app.setWebSuggestionsEnabled(webSuggestionsEnabled);
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

api.use((err, req, res, _next) => {
  res.status(400).send(err.message || 'Error');
});

export const server = createServer(api);

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}
