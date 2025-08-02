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

module.exports = { SimpleAI };
