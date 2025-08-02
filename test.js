const assert = require('assert');
const fs = require('fs');
const MemoryApp = require('./src/app');

(async () => {
  const app = new MemoryApp();

  const card = app.createCard({
    title: 'First note',
    content: 'Hello world',
    tags: ['intro']
  });

  app.addCardToDeck(card.id, 'general');

  assert.strictEqual(app.cards.size, 1, 'Card count should be 1');
  assert.ok(app.decks.get('general').cards.has(card.id), 'Deck should contain card');
  assert.strictEqual(app.searchByTag('intro')[0].id, card.id, 'Search should return the card');

  const second = app.createCard({
    title: 'Second note',
    content: 'Goodbye world',
    tags: ['outro']
  });

  app.addCardToDeck(second.id, 'general');

  const textResults = app.searchByText('goodbye');
  assert.strictEqual(textResults.length, 1, 'Text search should find one card');
  assert.strictEqual(textResults[0].id, second.id, 'Search result should be the second card');

  const link = app.createLink(card.id, second.id, 'relates');
  assert.strictEqual(app.getLinks(card.id)[0].id, link.id, 'Link should be retrievable from first card');
  assert.strictEqual(app.getLinks(second.id)[0].id, link.id, 'Link should be retrievable from second card');

  const removed = app.removeCard(card.id);
  assert.ok(removed, 'Card removal should return true');
  assert.strictEqual(app.cards.size, 1, 'Card count should be 1 after removal');
  assert.ok(!app.decks.get('general').cards.has(card.id), 'Deck should no longer contain removed card');
  assert.strictEqual(app.getLinks(second.id).length, 0, 'Links involving removed card should be cleaned up');

  const updated = app.updateCard(second.id, { title: 'Second updated', tags: ['edited'] });
  assert.strictEqual(updated.title, 'Second updated', 'Card title should be updated');
  assert.ok(updated.tags.has('edited'), 'Updated card should have new tag');
  assert.strictEqual(app.searchByTag('edited')[0].id, second.id, 'Search should return updated card');
  assert.strictEqual(app.searchByTag('outro').length, 0, 'Old tag should not be found');

  const deckRemoved = app.removeDeck('general');
  assert.ok(deckRemoved, 'Deck removal should return true');
  assert.ok(!app.decks.has('general'), 'Deck should be removed from app');
  assert.ok(!app.cards.get(second.id).decks.has('general'), 'Card should no longer list removed deck');

  // AI enrichment and search on description
  const aiApp = new MemoryApp();
  const aiCard = aiApp.createCard({
    title: 'AI note',
    content: 'Graph theory algorithms'
  });
  assert.ok(aiCard.tags.size > 0, 'AI should add tags');
  assert.ok(aiCard.description, 'AI should add description');
  aiApp.setAIEnabled(false);
  const plainCard = aiApp.createCard({ title: 'Plain', content: 'Just text' });
  assert.strictEqual(plainCard.tags.size, 0, 'No tags when AI disabled');
  assert.ok(!plainCard.description, 'No description when AI disabled');
  aiApp.updateCard(plainCard.id, { description: 'manual desc' });
  assert.strictEqual(aiApp.searchByText('manual')[0].id, plainCard.id, 'Search should include description');
  const aiFile = 'ai-memory.json';
  aiApp.saveToFile(aiFile);
  const aiLoaded = MemoryApp.loadFromFile(aiFile);
  fs.unlinkSync(aiFile);
  const loadedAiCard = aiLoaded.cards.get(aiCard.id);
  assert.strictEqual(loadedAiCard.description, aiCard.description, 'Description should persist');
  assert.strictEqual(loadedAiCard.type, aiCard.type, 'Type should persist');
  assert.strictEqual(loadedAiCard.createdAt, aiCard.createdAt, 'Creation date should persist');

  // create additional data to test persistence
  const third = app.createCard({ title: 'Third', content: 'More', tags: [] });
  app.addCardToDeck(second.id, 'final');
  app.addCardToDeck(third.id, 'final');
  app.createLink(second.id, third.id, 'related');

  const file = 'memory.json';
  app.saveToFile(file);
  const loaded = MemoryApp.loadFromFile(file);
  fs.unlinkSync(file);
  assert.strictEqual(loaded.cards.size, 2, 'Loaded app should have two cards');
  assert.ok(loaded.decks.has('final'), 'Loaded app should have the deck');
  assert.strictEqual(loaded.getLinks(second.id)[0].to, third.id, 'Loaded link should be preserved');

  const graph = loaded.getGraph({ deck: 'final' });
  assert.strictEqual(graph.nodes.length, 2, 'Graph should include two nodes');
  assert.strictEqual(graph.edges.length, 1, 'Graph should include one edge');
  assert.strictEqual(graph.edges[0].from, second.id, 'Edge should start from second card');
  assert.strictEqual(graph.edges[0].to, third.id, 'Edge should point to third card');

  const tagFiltered = loaded.getGraph({ deck: 'final', tag: 'edited' });
  assert.strictEqual(tagFiltered.nodes.length, 1, 'Tag filter should reduce nodes');
  assert.strictEqual(tagFiltered.nodes[0].id, second.id, 'Filtered node should be second card');
  assert.ok(tagFiltered.nodes[0].decks.includes('final'), 'Node should list deck membership');
  assert.strictEqual(tagFiltered.edges.length, 0, 'Edge should be dropped when referenced card missing');

  const typeFiltered = loaded.getGraph({ deck: 'final', linkType: 'related' });
  assert.strictEqual(typeFiltered.edges.length, 1, 'Link type filter should keep matching edges');

  // Web suggestions
  const suggestApp = new MemoryApp();
  suggestApp.createCard({ title: 'JS', content: '', tags: ['JavaScript'] });
  const suggestions = await suggestApp.getWebSuggestions(1);
  assert.ok(suggestions.length > 0, 'Should return at least one suggestion');
  assert.ok(suggestions[0].title, 'Suggestion should have a title');
  suggestApp.setWebSuggestionsEnabled(false);
  const noSuggestions = await suggestApp.getWebSuggestions();
  assert.strictEqual(noSuggestions.length, 0, 'No suggestions when disabled');

  console.log('All tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

