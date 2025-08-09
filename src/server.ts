// @ts-nocheck
import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import MemoryApp from './app.js';
import { z } from 'zod';
import { createServer } from 'http';

const ENC_KEY = process.env.ENCRYPTION_KEY || '';
export const app = new MemoryApp({ dbPath: process.env.DB_PATH, encryptionKey: ENC_KEY });
const API_TOKEN = process.env.API_TOKEN || '';

const api = express();
api.use(cors());
api.use(express.json({ limit: '10mb' }));

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

api.post('/api/cards', async (req, res, next) => {
  try {
    const data = cardSchema.parse(req.body);
    const card = await app.createCard(data as any);
    res.json(card);
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

api.use((err, req, res, _next) => {
  res.status(400).send(err.message || 'Error');
});

export const server = createServer(api);

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}
