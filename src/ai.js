const HF_MODELS = {
  summarization: 'facebook/bart-large-cnn',
  chat: 'HuggingFaceH4/zephyr-7b-beta',
  image: 'runwayml/stable-diffusion-v1-5'
};

class SimpleAI {
  async summarize(text) {
    return text.split(/\s+/).slice(0, 20).join(' ');
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
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.HUGGINGFACE_API_KEY;
    this.models = Object.assign({}, HF_MODELS, options.models);
  }

  async summarize(text) {
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

  async generateIllustration(prompt) {
    try {
      const base64 = await this._binary(this.models.image, { inputs: prompt });
      return `data:image/png;base64,${base64}`;
    } catch (e) {
      return `illustration-${prompt.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.png`;
    }
  }

  async chat(query, app) {
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
}

module.exports = { SimpleAI, HuggingFaceAI, HF_MODELS };
