const fs = require('fs');

const HF_MODELS = {
  summarization: 'google/mt5-base',
  chat: 'HuggingFaceH4/zephyr-7b-beta',
  image: 'runwayml/stable-diffusion-v1-5',
  transcription: 'openai/whisper-base'
};

async function fetchTopModel(apiKey, pipelineTag, search) {
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
    const data = await res.json();
    return data[0]?.modelId || null;
  } catch (e) {
    return null;
  }
}

class SimpleAI {
  async summarize(text) {
    return text.split(/\s+/).slice(0, 20).join(' ');
  }

  async summarizeCard(card) {
    const text = card.content || card.source || card.title || '';
    return this.summarize(text);
  }

  async generateIllustration(title) {
    return `illustration-${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.png`;
  }

  async chat(query, app) {
    const results = app.searchByText(query);
    if (results.length === 0) {
      return 'No matching cards.';
    }
    const card = results[0];
    const summary = card.summary || card.content.slice(0, 100);
    return `Found card ${card.title}: ${summary}`;
  }
}

class HuggingFaceAI {
  static _cachedModels = null;

  constructor(options = {}) {
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
    const summarization = await fetchTopModel(apiKey, 'summarization');
    const chat = await fetchTopModel(apiKey, 'text-generation', 'chat');
    const image = await fetchTopModel(apiKey, 'text-to-image', 'stable-diffusion');
    const transcription = await fetchTopModel(apiKey, 'automatic-speech-recognition');
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

  async summarizeCard(card) {
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
    try {
      const base64 = await this._binary(this.models.image, { inputs: prompt });
      return `data:image/png;base64,${base64}`;
    } catch (e) {
      return `illustration-${prompt.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.png`;
    }
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
        .map(c => `${c.title}: ${c.content}`)
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
    return res.json();
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
    return res.json();
  }
}

module.exports = { SimpleAI, HuggingFaceAI, HF_MODELS };
