import fs from 'fs';
import path from 'path';
import type Card from './card.js';
import type MemoryApp from './app.js';
import type { AIProvider } from './types.js';
import { extractiveSummarize } from './contentAnalyzer.js';

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

export class SimpleAI implements AIProvider {
  async summarize(text: string): Promise<string> {
    if (!text || text.trim().length === 0) return '';
    return extractiveSummarize(text, 3);
  }

  async summarizeCard(card: Card): Promise<string> {
    const text = card.content || card.source || card.title || '';
    return this.summarize(text);
  }

  async generateIllustration(prompt: string): Promise<string> {
    // Use Pollinations.ai — free, no API key required, generates real images from prompts
    const cleanPrompt = `minimalist flat design illustration of ${prompt}, vibrant colors, simple shapes, digital art`;
    const seed = [...prompt].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % 99999;
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=400&height=280&nologo=true&seed=${seed}&model=flux`;
  }

  async chat(query: string, app: MemoryApp): Promise<string> {
    const results = app.searchByText(query);
    if (results.length === 0) {
      return 'No matching cards.';
    }
    const card = results[0];
    const summary = card.summary || card.content?.slice(0, 100) || '';
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

  async analyzeImage(base64: string, mimeType = 'image/jpeg'): Promise<{ description: string; extractedText: string; tags: string[] }> {
    return _pollinationsAnalyzeImage(base64, mimeType);
  }
}

/** Shared Pollinations vision call used by all AI providers */
async function _pollinationsAnalyzeImage(
  base64: string,
  mimeType = 'image/jpeg'
): Promise<{ description: string; extractedText: string; tags: string[] }> {
  const prompt =
    'Analyze this image. Identify objects, scene, colors, any visible text, and themes. ' +
    'Reply ONLY with this JSON (no markdown fences, no extra words): ' +
    '{"description":"2-3 sentence description","extractedText":"any text in image or empty string","tags":["tag1","tag2","tag3","tag4","tag5"]}';
  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173',
        'Referer': 'http://localhost:5173/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        model: 'openai-large',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any;
    const content: string = data.choices?.[0]?.message?.content ?? '';
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        description:   String(parsed.description   ?? ''),
        extractedText: String(parsed.extractedText ?? ''),
        tags:          Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      };
    }
  } catch {
    // Fall through to empty result
  }
  return { description: '', extractedText: '', tags: [] };
}

export class HuggingFaceAI implements AIProvider {
  static _cachedModels: Record<string, string> | null = null;
  apiKey?: string;
  models: Record<string, string> = {};
  ready: Promise<void>;
  timeout: number;

  constructor(options: { apiKey?: string; models?: Record<string, string>; timeout?: number; autoSelect?: boolean } = {}) {
    this.apiKey = options.apiKey || process.env.HUGGINGFACE_API_KEY;
    this.models = Object.assign({}, HF_MODELS, options.models);
    this.timeout = options.timeout ?? 5000;
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

  static async getRecommendedModels(apiKey: string | undefined = process.env.HUGGINGFACE_API_KEY) {
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

  async summarize(text: string): Promise<string> {
    await this.ready;
    // Try HuggingFace summarization model first
    try {
      const data = await this._json(this.models.summarization, { inputs: text });
      if (Array.isArray(data) && data[0] && data[0].summary_text) {
        return data[0].summary_text;
      }
    } catch { /* fall through */ }
    return extractiveSummarize(text, 3);
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

  async generateIllustration(prompt: string): Promise<string> {
    await this.ready;
    const styled = `cartoon art deco illustration of ${prompt}`;
    try {
      const base64 = await this._binary(this.models.image, { inputs: styled });
      return `data:image/png;base64,${base64}`;
    } catch (e) {
      // Fall back to Pollinations on HuggingFace failure
      const seed = [...prompt].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % 99999;
      return `https://image.pollinations.ai/prompt/${encodeURIComponent(`illustration of ${prompt}`)}?width=400&height=280&nologo=true&seed=${seed}&model=flux`;
    }
  }

  async embed(text: string): Promise<number[]> {
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

  async transcribe(path: string): Promise<string> {
    await this.ready;
    const buf = await fs.promises.readFile(path);
    const data = await this._file(this.models.transcription, buf, 'audio/mpeg');
    return data.text || '';
  }

  async _extractFromUrl(url: string): Promise<string> {
    const res = await fetch(url);
    const html = await res.text();
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async chat(query: string, app: MemoryApp): Promise<string> {
    await this.ready;
    try {
      const context = Array.from(app.cards.values())
        .slice(0, 3)
        .map((c: any) => `${c.title}: ${c.content}`)
        .join('\n');
      const prompt = `You are a helpful assistant for a personal memory app.\n${context}\nUser: ${query}\nAssistant:`;
      const data = await this._json(this.models.chat, {
        inputs: prompt,
        parameters: { max_new_tokens: 60 }
      });
      const text = data.generated_text || data[0]?.generated_text;
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
      const summary = card.summary || card.content?.slice(0, 100) || '';
    return `Found card ${card.title}: ${summary}`;
  }

  private async _fetch(url: string, options: RequestInit) {
    try {
      return await fetch(url, { ...options, signal: AbortSignal.timeout(this.timeout) });
    } catch (e: any) {
      if (e.name === 'AbortError') {
        throw new Error(`HF request timed out after ${this.timeout}ms`);
      }
      throw e;
    }
  }

  async _json(model: string, payload: unknown): Promise<any> {
    const res = await this._fetch(`https://api-inference.huggingface.co/models/${model}`, {
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

  async _binary(model: string, payload: unknown): Promise<string> {
    const res = await this._fetch(`https://api-inference.huggingface.co/models/${model}`, {
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

  async _file(model: string, buffer: Buffer, contentType: string): Promise<any> {
    const res = await this._fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': contentType
      },
      body: buffer as unknown as BodyInit
    });
    if (!res.ok) {
      throw new Error(`HF request failed: ${res.status}`);
    }
    return (await res.json()) as any;
  }

  async analyzeImage(base64: string, mimeType = 'image/jpeg'): Promise<{ description: string; extractedText: string; tags: string[] }> {
    return _pollinationsAnalyzeImage(base64, mimeType);
  }
}

export class TransformersAI implements AIProvider {
  modelsDir: string;
  summarizer: any;
  embedder: any;
  fallback: any;

  constructor(options: { modelsDir?: string; fallback?: AIProvider; apiKey?: string } = {}) {
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

  async summarize(text: string): Promise<string> {
    try {
      await this._ensure();
      const res = await this.summarizer(text);
      return res[0]?.summary_text || text.split(/\s+/).slice(0, 20).join(' ');
    } catch (e) {
      return this.fallback.summarize(text);
    }
  }

  async summarizeCard(card: Card): Promise<string> {
    const text = card.content || card.source || card.title || '';
    return this.summarize(text);
  }

  async embed(text: string): Promise<number[]> {
    try {
      await this._ensure();
      const res = await this.embedder(text, { pooling: 'mean', normalize: true });
      const arr = Array.from(res.data || res) as number[];
      return arr;
    } catch (e) {
      if (this.fallback.embed) {
        return this.fallback.embed(text);
      }
      return [];
    }
  }

  async generateIllustration(title: string): Promise<string> {
    if (this.fallback.generateIllustration) {
      return this.fallback.generateIllustration(title);
    }
    return '';
  }

  async chat(query: string, app: MemoryApp): Promise<string> {
    if (this.fallback.chat) {
      return this.fallback.chat(query, app);
    }
    return '';
  }

  async analyzeImage(base64: string, mimeType = 'image/jpeg'): Promise<{ description: string; extractedText: string; tags: string[] }> {
    return _pollinationsAnalyzeImage(base64, mimeType);
  }
}
