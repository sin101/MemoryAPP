import fs from 'fs';
import path from 'path';
import type Card from './card.js';

export const HF_MODELS: Record<string, string> = {
  summarization: 'google/mt5-base',
  chat: 'HuggingFaceH4/zephyr-7b-beta',
  image: 'runwayml/stable-diffusion-v1-5',
  transcription: 'openai/whisper-base',
  embedding: 'sentence-transformers/all-MiniLM-L6-v2'
};

async function fetchTopModel(apiKey: string, pipelineTag: string, search?: string): Promise<string | null> {
  let url = `https://huggingface.co/api/models?pipeline_tag=${pipelineTag}&sort=downloads&direction=-1&limit=1`;
  if (search) {
    url += `&search=${encodeURIComponent(search)}`;
  }
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) {
      return null;
    }
    const data: any = await res.json();
    return data[0]?.modelId || null;
  } catch (e) {
    return null;
  }
}

const LOCAL_MODEL_DIR = path.join(__dirname, '..', 'models');

export function hasLocalModels(modelsDir = LOCAL_MODEL_DIR): boolean {
  return (
    fs.existsSync(path.join(modelsDir, 'summarization', 'config.json')) &&
    fs.existsSync(path.join(modelsDir, 'embedding', 'config.json'))
  );
}

let transformersPromise: Promise<any> | null = null;
function loadTransformers(): Promise<any> {
  if (!transformersPromise) {
    transformersPromise = import('@xenova/transformers');
  }
  return transformersPromise;
}

export class SimpleAI {
  async summarize(text: string): Promise<string> {
    return text.split(/\s+/).slice(0, 20).join(' ');
  }

  async summarizeCard(card: Card): Promise<string> {
    const text = card.content || card.source || card.title || '';
    return this.summarize(text);
  }

  async generateIllustration(title: string): Promise<string> {
    const hash = [...title].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0);
    let seed = hash || 1;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    const palette = ['#f15bb5', '#fee440', '#00bbf9', '#00f5d4', '#9b5de5'];
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">';
    for (let i = 0; i < 3; i++) {
      const color = palette[Math.floor(rand() * palette.length)];
      const x = Math.floor(rand() * 150);
      const y = Math.floor(rand() * 300);
      const w = 20 + Math.floor(rand() * 80);
      const h = 20 + Math.floor(rand() * 80);
      const mirrorX = 300 - x - w;
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" opacity="0.7"/>`;
      svg += `<rect x="${mirrorX}" y="${y}" width="${w}" height="${h}" fill="${color}" opacity="0.7"/>`;
    }
    const circleColor = palette[Math.floor(rand() * palette.length)];
    const radius = 40 + rand() * 50;
    svg += `<circle cx="150" cy="150" r="${radius}" fill="${circleColor}" opacity="0.5"/>`;
    svg += '</svg>';
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  async chat(query: string, app: any): Promise<string> {
    const results = app.searchByText(query);
    if (results.length === 0) {
      return 'No matching cards.';
    }
    const card = results[0];
    const summary = card.summary || card.content.slice(0, 100);
    return `Found card ${card.title}: ${summary}`;
  }

  async embed(text: string): Promise<number[]> {
    const vec = new Array(26).fill(0);
    for (const ch of text.toLowerCase()) {
      const idx = ch.charCodeAt(0) - 97;
      if (idx >= 0 && idx < 26) {
        vec[idx] += 1;
      }
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / norm);
  }
}

export class HuggingFaceAI {
  static _cachedModels: any = null;
  apiKey?: string;
  models: Record<string, string> = {};
  ready: Promise<void>;

  constructor(options: any = {}) {
    this.apiKey = options.apiKey || process.env.HUGGINGFACE_API_KEY;
    this.models = Object.assign({}, HF_MODELS, options.models);
    if (options.autoSelect !== false) {
      this.ready = (async () => {
        if (!HuggingFaceAI._cachedModels) {
          const rec = await HuggingFaceAI.getRecommendedModels(this.apiKey);
          HuggingFaceAI._cachedModels = rec;
        }
        this.models = Object.assign({}, this.models, HuggingFaceAI._cachedModels);
      })();
    } else {
      this.ready = Promise.resolve();
    }
  }

  static async getRecommendedModels(apiKey = process.env.HUGGINGFACE_API_KEY) {
    const summarization = await fetchTopModel(apiKey || '', 'summarization');
    const chat = await fetchTopModel(apiKey || '', 'text-generation', 'chat');
    const image = await fetchTopModel(apiKey || '', 'text-to-image', 'stable-diffusion');
    const transcription = await fetchTopModel(apiKey || '', 'automatic-speech-recognition');
    return {
      summarization: summarization || HF_MODELS.summarization,
      chat: chat || HF_MODELS.chat,
      image: image || HF_MODELS.image,
      transcription: transcription || HF_MODELS.transcription
    };
  }

  async summarize(text) {
    await this.ready;
    try {
      const data = await this._json(this.models.summarization, { inputs: text });
      if (Array.isArray(data) && data[0] && data[0].summary_text) {
        return data[0].summary_text;
      }
    } catch (e) {
      // fall back to simple heuristic
    }
    return text.split(/\s+/).slice(0, 20).join(' ');
  }

  async summarizeCard(card: Card) {
    await this.ready;
    let text = card.content || card.source || card.title || '';
    if (card.type === 'audio' || card.type === 'video') {
      try {
        text = await this.transcribe(text);
      } catch (e) {
        // keep original text on failure
      }
    } else if (card.type === 'url') {
      try {
        text = await this._extractFromUrl(text);
      } catch (e) {
        // ignore and fall back to original text
      }
    }
    return this.summarize(text);
  }

  async generateIllustration(prompt) {
    await this.ready;
    const styled = `cartoon art deco illustration of ${prompt}`;
    try {
      const base64 = await this._binary(this.models.image, { inputs: styled });
      return `data:image/png;base64,${base64}`;
    } catch (e) {
      return `illustration-${prompt.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.png`;
    }
  }

  async embed(text) {
    await this.ready;
    try {
      const data = await this._json(this.models.embedding, { inputs: text });
      if (Array.isArray(data)) {
        const arr = Array.isArray(data[0][0]) ? data[0] : [data[0]];
        const dim = arr[0].length;
        const out = new Array(dim).fill(0);
        for (const token of arr) {
          for (let i = 0; i < dim; i++) {
            out[i] += token[i];
          }
        }
        return out.map(v => v / arr.length);
      }
    } catch (e) {
      // ignore errors and fall back to empty embedding
    }
    return [];
  }

  async transcribe(path) {
    await this.ready;
    const buf = await fs.promises.readFile(path);
    const data = await this._file(this.models.transcription, buf, 'audio/mpeg');
    return data.text || '';
  }

  async _extractFromUrl(url) {
    const res = await fetch(url);
    const html = await res.text();
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async chat(query, app) {
    await this.ready;
    try {
      const context = Array.from(app.cards.values())
        .slice(0, 3)
        .map((c: any) => `${c.title}: ${c.content}`)
        .join('\n');
      const prompt = `You are a helpful assistant for a personal memory app.\n${context}\nUser: ${query}\nAssistant:`;
      const data: any = await this._json(this.models.chat, {
        inputs: prompt,
        parameters: { max_new_tokens: 60 }
      });
      const text = (data as any).generated_text || data[0]?.generated_text;
      if (text) {
        return text.replace(prompt, '').trim();
      }
    } catch (e) {
      // fall back to search-based answer
    }
    const results = app.searchByText(query);
    if (results.length === 0) {
      return 'No matching cards.';
    }
    const card = results[0];
    const summary = card.summary || card.content.slice(0, 100);
    return `Found card ${card.title}: ${summary}`;
  }

  async _json(model, payload) {
    const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`HF request failed: ${res.status}`);
    }
    return (await res.json()) as any;
  }

  async _binary(model, payload) {
    const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'image/png'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`HF request failed: ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString('base64');
  }

  async _file(model, buffer, contentType) {
    const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': contentType
      },
      body: buffer
    });
    if (!res.ok) {
      throw new Error(`HF request failed: ${res.status}`);
    }
    return (await res.json()) as any;
  }
}

export class TransformersAI {
  modelsDir: string;
  summarizer: any;
  embedder: any;
  fallback: any;

  constructor(options: any = {}) {
    this.modelsDir = options.modelsDir || LOCAL_MODEL_DIR;
    this.summarizer = null;
    this.embedder = null;
    this.fallback = options.fallback || (process.env.HUGGINGFACE_API_KEY ? new HuggingFaceAI(options) : new SimpleAI());
  }

  async _ensure() {
    if (this.summarizer && this.embedder) {
      return;
    }
    if (!hasLocalModels(this.modelsDir)) {
      throw new Error('Local models not found');
    }
    const { pipeline } = await loadTransformers();
    if (!this.summarizer) {
      const sumDir = path.join(this.modelsDir, 'summarization');
      this.summarizer = await pipeline('summarization', sumDir);
    }
    if (!this.embedder) {
      const embDir = path.join(this.modelsDir, 'embedding');
      this.embedder = await pipeline('feature-extraction', embDir);
    }
  }

  async summarize(text) {
    try {
      await this._ensure();
      const res = await this.summarizer(text);
      return res[0]?.summary_text || text.split(/\s+/).slice(0, 20).join(' ');
    } catch (e) {
      return this.fallback.summarize(text);
    }
  }

  async summarizeCard(card: Card) {
    const text = card.content || card.source || card.title || '';
    return this.summarize(text);
  }

  async embed(text) {
    try {
      await this._ensure();
      const res = await this.embedder(text, { pooling: 'mean', normalize: true });
      const arr = Array.from(res.data || res);
      return arr;
    } catch (e) {
      if (this.fallback.embed) {
        return this.fallback.embed(text);
      }
      return [];
    }
  }
}

