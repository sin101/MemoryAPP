const assert = require('assert');
const fs = require('fs');
const MemoryApp = require('./src/app');
const { fetchSuggestion } = require('./src/suggestions');
const { SimpleAI } = require('./src/ai');

(async () => {
  const app = new MemoryApp();

  const card = await app.createCard({
    title: 'First note',
    content: 'Hello world',
    tags: ['intro']
  });

  assert.ok(card.summary, 'Card should have a summary');
  assert.ok(card.illustration, 'Card should have an illustration');

  app.addCardToDeck(card.id, 'general');
  app.addCardToDeck(card.id, 'secondary');

  assert.strictEqual(app.cards.size, 1, 'Card count should be 1');
  assert.ok(app.decks.get('general').cards.has(card.id), 'Deck should contain card');
  assert.strictEqual(app.searchByTag('intro')[0].id, card.id, 'Search should return the card');
  await assert.rejects(
    app.createCard({ id: card.id, title: 'Dup', content: 'Dup content' }),
    /already exists/
  );
  assert.strictEqual(app.cards.size, 1, 'Duplicate card should not be added');

  const second = await app.createCard({
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

  const extra = await app.createCard({
    title: 'Extra note',
    content: 'Another world',
    tags: ['extra']
  });
  const extraLink = app.createLink(extra.id, card.id, 'relates');
  assert.strictEqual(app.getLinks(extra.id)[0].id, extraLink.id, 'Link should be retrievable from extra card');

  const annotated = app.createLink(second.id, extra.id, 'relates', 'cross-ref');
  assert.strictEqual(annotated.annotation, 'cross-ref', 'Link should store annotation');

  let removedEvents = 0;
  const onLinkRemoved = () => { removedEvents += 1; };
  app.on('linkRemoved', onLinkRemoved);

  const removed = app.removeCard(card.id);
  assert.ok(removed, 'Card removal should return true');
  assert.strictEqual(removedEvents, 2, 'Removing card should emit linkRemoved for each link');
  app.removeListener('linkRemoved', onLinkRemoved);
  assert.strictEqual(app.cards.size, 2, 'Card count should be 2 after removal');
  assert.ok(!app.decks.get('general').cards.has(card.id), 'Deck should no longer contain removed card');
  assert.ok(!app.decks.get('secondary').cards.has(card.id), 'All decks should remove the card');
  assert.strictEqual(app.getLinks(second.id).length, 1, 'Remaining links should persist after unrelated card removal');
  assert.strictEqual(app.getLinks(extra.id).length, 1, 'Links not involving removed card should persist');

  app.removeCard(extra.id);
  assert.strictEqual(app.cards.size, 1, 'Card count should be 1 after cleanup');
  assert.strictEqual(app.getLinks(second.id).length, 0, 'Links should be cleaned after removing linked card');

  const updated = await app.updateCard(second.id, { title: 'Second updated', tags: ['edited'] });
  assert.strictEqual(updated.title, 'Second updated', 'Card title should be updated');
  assert.ok(updated.tags.has('edited'), 'Updated card should have new tag');
  assert.strictEqual(app.searchByTag('edited')[0].id, second.id, 'Search should return updated card');
  assert.strictEqual(app.searchByTag('outro').length, 0, 'Old tag should not be found');

  const deckRemoved = app.removeDeck('general');
  assert.ok(deckRemoved, 'Deck removal should return true');
  assert.ok(!app.decks.has('general'), 'Deck should be removed from app');
  assert.ok(!app.cards.get(second.id).decks.has('general'), 'Card should no longer list removed deck');

  // Searching cards missing title or content
  const searchApp = new MemoryApp();
  searchApp.setAIEnabled(false);
  const titleOnly = await searchApp.createCard({ title: 'Title Only' });
  const contentOnly = await searchApp.createCard({ content: 'Content Only' });
  assert.strictEqual(searchApp.searchByText('title')[0].id, titleOnly.id, 'Search should find card lacking content');
  assert.strictEqual(searchApp.searchByText('content')[0].id, contentOnly.id, 'Search should find card lacking title');

  // Generic content handling with source persistence
  const mediaApp = new MemoryApp();
  const mediaCard = await mediaApp.createCard({
    title: 'Photo',
    source: 'photo.png',
    type: 'image',
    tags: ['pic']
  });
  assert.ok(mediaCard.summary, 'Media card should have a summary');
  assert.strictEqual(mediaApp.searchByTag('pic')[0].id, mediaCard.id, 'Tag search should find media card');
  const mediaFile = 'media.json';
  await mediaApp.saveToFile(mediaFile);
  const loadedMedia = await MemoryApp.loadFromFile(mediaFile);
  fs.unlinkSync(mediaFile);
  assert.strictEqual(loadedMedia.cards.get(mediaCard.id).source, 'photo.png', 'Source should persist through export');

  // AI enrichment and search on description
  const aiApp = new MemoryApp();
  const aiCard = await aiApp.createCard({
    title: 'AI note',
    content: 'Graph theory algorithms'
  });
  assert.ok(aiCard.tags.size > 0, 'AI should add tags');
  assert.ok(aiCard.description, 'AI should add description');
  assert.strictEqual(aiApp.searchByText('graph')[0].id, aiCard.id, 'Search should include AI-generated description');
  aiApp.setAIEnabled(false);
  const plainCard = await aiApp.createCard({ title: 'Plain', content: 'Just text' });
  assert.strictEqual(plainCard.tags.size, 0, 'No tags when AI disabled');
  assert.ok(!plainCard.description, 'No description when AI disabled');
  await aiApp.updateCard(plainCard.id, { description: 'manual desc' });
  assert.strictEqual(aiApp.searchByText('manual')[0].id, plainCard.id, 'Search should include description');
  const aiFile = 'ai-memory.json';
  await aiApp.saveToFile(aiFile);
  const aiLoaded = await MemoryApp.loadFromFile(aiFile);
  fs.unlinkSync(aiFile);
  const loadedAiCard = aiLoaded.cards.get(aiCard.id);
  assert.strictEqual(loadedAiCard.description, aiCard.description, 'Description should persist');
  assert.strictEqual(loadedAiCard.type, aiCard.type, 'Type should persist');
  assert.strictEqual(loadedAiCard.createdAt, aiCard.createdAt, 'Creation date should persist');

  // Semantic search
  const semApp = new MemoryApp({ ai: new SimpleAI() });
  const semTarget = await semApp.createCard({
    title: 'Graphs',
    content: 'Graph theory algorithms'
  });
  await semApp.createCard({ title: 'Cooking', content: 'Recipe for pasta' });
  const semResults = await semApp.searchBySemantic('graph algorithms');
  assert.strictEqual(semResults[0].id, semTarget.id, 'Semantic search should find related card');
  semApp.setAIEnabled(false);
  const semFallback = await semApp.searchBySemantic('graph');
  assert.strictEqual(semFallback.length, 1, 'Fallback search should return one result');
  assert.strictEqual(semFallback[0].id, semTarget.id, 'Fallback should use text search when AI disabled');

  // Chatbot query
  const chatApp = new MemoryApp();
  await chatApp.createCard({ title: 'ChatRef', content: 'discussion topic' });
  const chatRefReply = await chatApp.chat('discussion');
  assert.ok(chatRefReply.includes('ChatRef'), 'Chat should reference matching card');

  // Performance/behavior with many cards
  const manyApp = new MemoryApp();
  manyApp.setAIEnabled(false);
  const total = 500;
  for (let i = 0; i < total; i++) {
    await manyApp.createCard({ title: `C${i}`, content: '', tags: ['bulk'] });
  }
  const indexStart = Date.now();
  const bulkResults = manyApp.searchByTag('bulk');
  const indexedTime = Date.now() - indexStart;
  assert.strictEqual(bulkResults.length, total, 'Indexed search should return all cards');
  const naiveStart = Date.now();
  const naiveResults = Array.from(manyApp.cards.values()).filter(c => c.tags.has('bulk'));
  const naiveTime = Date.now() - naiveStart;
  assert.strictEqual(naiveResults.length, total, 'Naive search should match result count');
  assert.ok(indexedTime <= naiveTime + 20, 'Indexed search should not be significantly slower than naive scan');
  await manyApp.updateCard(bulkResults[0].id, { tags: ['bulk', 'extra'] });
  assert.strictEqual(manyApp.searchByTag('extra').length, 1, 'Updated tag should be indexed');
  manyApp.removeCard(bulkResults[1].id);
  assert.strictEqual(manyApp.searchByTag('bulk').length, total - 1, 'Removed card should be dropped from index');

  // create additional data to test persistence
  const third = await app.createCard({ title: 'Third', content: 'More', tags: [] });
  app.addCardToDeck(second.id, 'final');
  app.addCardToDeck(third.id, 'final');
  app.createLink(second.id, third.id, 'related');

  const file = 'memory.json';
  await app.saveToFile(file);
  const loaded = await MemoryApp.loadFromFile(file);
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

  // Chatbot retrieval
  const chatReply = await app.chat('Second updated');
  assert.ok(chatReply.includes('Second updated'), 'Chat should reference updated card');

  const customAI = {
    async summarize() { return 'LLM summary'; },
    async generateIllustration() { return 'llm.png'; },
    async chat() { return 'custom reply'; }
  };
  const customApp = new MemoryApp({ ai: customAI });
  const customCard = await customApp.createCard({ title: 'Custom', content: 'something' });
  assert.strictEqual(customCard.summary, 'LLM summary', 'Custom summarizer should be used');
  assert.strictEqual(customCard.illustration, 'llm.png', 'Custom illustrator should be used');
  const customChat = await customApp.chat('anything');
  assert.strictEqual(customChat, 'custom reply', 'Custom chat should be used');

  // Web suggestions
  const suggestApp = new MemoryApp();
  await suggestApp.createCard({ title: 'JS', content: '', tags: ['JavaScript', 'code'] });
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      async json() {
        return { data: { children: [] } }; // forces fallback
      },
      async text() {
        return '<rss><channel><item><title>Stub</title><link>https://example.com</link></item></channel></rss>';
      },
    };
  };
  const suggestions = await suggestApp.getWebSuggestions(1);
  assert.strictEqual(suggestions.length, 1, 'Should return one suggestion');
  assert.strictEqual(suggestions[0].title, 'Stub', 'Suggestion should use stub');
  const cardId = Array.from(suggestApp.cards.keys())[0];
  const cardSuggestions = await suggestApp.getCardSuggestions(cardId, 1);
  assert.strictEqual(cardSuggestions.length, 1, 'Card suggestion should return one result');
  const themeSuggestions = await suggestApp.getThemeSuggestions(1);
  assert.strictEqual(themeSuggestions.length, 1, 'Theme suggestion should return one result');
  const directSuggestion = await fetchSuggestion('demo');
  assert.ok(directSuggestion, 'Direct suggestion should return a result');
  suggestApp.setWebSuggestionsEnabled(false);
  const noSuggestions = await suggestApp.getWebSuggestions();
  assert.strictEqual(noSuggestions.length, 0, 'No suggestions when disabled');
  assert.ok(fetchCalls >= 6, 'Should attempt multiple sources for suggestions');
  global.fetch = originalFetch;

  // Parallel resolution prefers fastest source
  const raceFetch = async url => {
    if (url.includes('news.google')) {
      await new Promise(r => setTimeout(r, 20));
      return {
        ok: true,
        async text() {
          return '<rss><channel><item><title>Fast</title><link>https://fast.example</link></item></channel></rss>';
        },
      };
    }
    await new Promise(r => setTimeout(r, 100));
    return { ok: false, async json() { return {}; }, async text() { return ''; } };
  };
  global.fetch = raceFetch;
  const raceStart = Date.now();
  const fastSuggestion = await fetchSuggestion('speed');
  const duration = Date.now() - raceStart;
  assert.strictEqual(fastSuggestion.title, 'Fast', 'Should use quickest source');
  assert.ok(duration < 150, 'Should resolve before slower sources');

  // Fallback when sources hang
  global.fetch = () => new Promise(() => {});
  const timeoutStart = Date.now();
  const timeoutSuggestion = await fetchSuggestion('timeout');
  const timeoutDuration = Date.now() - timeoutStart;
  assert.strictEqual(timeoutSuggestion.source, 'none', 'Should fallback on timeout');
  assert.ok(timeoutDuration < 1500, 'Timeout should prevent hanging');
  global.fetch = originalFetch;

  // Event order for create and update
  const orderCreateApp = new MemoryApp();
  const createEvents = [];
  orderCreateApp.on('cardCreated', () => createEvents.push('created'));
  orderCreateApp.on('cardProcessed', () => createEvents.push('processed'));
  await orderCreateApp.createCard({ title: 'Order', content: 'test' });
  assert.deepStrictEqual(createEvents, ['created', 'processed'], 'Create events should fire in order');

  const orderUpdateApp = new MemoryApp();
  const updateCard = await orderUpdateApp.createCard({ title: 'Before', content: 'update' });
  const updateEvents = [];
  orderUpdateApp.on('cardUpdated', () => updateEvents.push('updated'));
  orderUpdateApp.on('cardProcessed', () => updateEvents.push('processed'));
  await orderUpdateApp.updateCard(updateCard.id, { title: 'After' });
  assert.deepStrictEqual(updateEvents, ['updated', 'processed'], 'Update events should fire in order');

  // Event-driven background processing
  const eventApp = new MemoryApp({ backgroundProcessing: true });
  const createdPromise = new Promise(res => eventApp.once('cardCreated', res));
  const processedPromise = new Promise(res => eventApp.once('cardProcessed', res));
  const eventCard = await eventApp.createCard({ title: 'Async', content: 'background task' });
  const createdCard = await createdPromise;
  assert.strictEqual(createdCard.id, eventCard.id, 'cardCreated should emit with card');
  assert.ok(!eventCard.summary, 'Summary should not be ready immediately when processing in background');
  const processedCard = await processedPromise;
  assert.strictEqual(processedCard.id, eventCard.id, 'cardProcessed should emit after processing');
  assert.ok(processedCard.summary, 'Summary should be generated in background');

  // Database persistence
  const dbFile = 'cards.db';
  const dbApp1 = new MemoryApp({ dbPath: dbFile });
  const dbCard = await dbApp1.createCard({ title: 'DB', content: 'Stored in sqlite', source: 'dbsource.txt' });
  dbApp1.db.close();
  const dbApp2 = new MemoryApp({ dbPath: dbFile });
  assert.ok(dbApp2.cards.has(dbCard.id), 'DB app should load existing card');
  assert.strictEqual(dbApp2.cards.get(dbCard.id).summary, dbCard.summary, 'Summary should persist in DB');
  assert.strictEqual(dbApp2.cards.get(dbCard.id).source, 'dbsource.txt', 'Source should persist in DB');
  dbApp2.db.close();
  fs.unlinkSync(dbFile);

  // Link ID uniqueness after deletions and reload
  const linkApp = new MemoryApp();
  const c1 = await linkApp.createCard({ title: 'A', content: '' });
  const c2 = await linkApp.createCard({ title: 'B', content: '' });
  const c3 = await linkApp.createCard({ title: 'C', content: '' });
  const firstLink = linkApp.createLink(c1.id, c2.id, 'relates');
  linkApp.removeLink(firstLink.id);
  const secondLink = linkApp.createLink(c2.id, c3.id, 'relates');
  assert.strictEqual(secondLink.id, '2', 'Link IDs should increment after deletion');
  const linkFile = 'links.json';
  await linkApp.saveToFile(linkFile);
  const reloaded = await MemoryApp.loadFromFile(linkFile);
  fs.unlinkSync(linkFile);
  const thirdLink = reloaded.createLink(c1.id, c3.id, 'relates');
  assert.strictEqual(thirdLink.id, '3', 'Link ID should continue after reload');

  // Audio note creation with transcription
  const transAI = new SimpleAI();
  transAI.transcribe = async () => 'spoken words';
  const audioApp = new MemoryApp({ ai: transAI });
  fs.writeFileSync('note.webm', 'dummy');
  const audioCard = await audioApp.createAudioNote('note.webm', { title: 'Voice' });
  assert.strictEqual(audioCard.content, 'spoken words', 'Audio note should transcribe content');
  assert.strictEqual(audioCard.type, 'audio', 'Audio note should have audio type');

  // Favorite deck from usage stats
  const usageApp = new MemoryApp();
  const u1 = await usageApp.createCard({ title: 'U1', content: '' });
  const u2 = await usageApp.createCard({ title: 'U2', content: '' });
  usageApp.recordCardUsage(u1.id);
  usageApp.recordCardUsage(u1.id);
  usageApp.recordCardUsage(u2.id);
  assert.ok(usageApp.getDeck('favorites').cards.has(u1.id), 'Most used card should be favorite');

  // Suggestion filtering of null results
  delete require.cache[require.resolve('./src/app')];
  delete require.cache[require.resolve('./src/suggestions')];
  require.cache[require.resolve('./src/suggestions')] = {
    exports: {
      fetchSuggestion: async tag => tag === 'nulltag'
        ? null
        : { tag, title: tag, description: '', url: '', source: 'test' }
    }
  };
  const FilterApp = require('./src/app');
  const filterApp = new FilterApp();
  const filterCard = await filterApp.createCard({ title: 'Filter', content: '', tags: ['nulltag', 'good'] });
  const cardFiltered = await filterApp.getCardSuggestions(filterCard.id, 5);
  assert.strictEqual(cardFiltered.length, 1, 'Card suggestions should filter out nulls');
  assert.strictEqual(cardFiltered[0].tag, 'good', 'Non-null suggestion should remain');
  const themeFiltered = await filterApp.getThemeSuggestions(5);
  assert.strictEqual(themeFiltered.length, 1, 'Theme suggestions should filter out nulls');
  assert.strictEqual(themeFiltered[0].tag, 'good', 'Theme should include non-null suggestion');

  // Encrypted export/import
  const encApp = new MemoryApp();
  const encCard = await encApp.createCard({ title: 'Secret', content: 'hidden' });
  const encFile = 'secret.bin';
  await encApp.saveEncryptedToFile(encFile, 'pw');
  const encLoaded = await MemoryApp.loadEncryptedFromFile(encFile, 'pw');
  fs.unlinkSync(encFile);
  assert.strictEqual(encLoaded.cards.get(encCard.id).content, 'hidden', 'Encrypted roundtrip should preserve content');

  // ZIP export/import
  const zipApp = new MemoryApp();
  await zipApp.createCard({ title: 'ZipCard', content: 'zip' });
  await zipApp.saveMedia(Buffer.from('filedata'), 'file.txt');
  const zipFile = 'cards.zip';
  await zipApp.exportZip(zipFile);
  const imported = await MemoryApp.importZip(zipFile);
  fs.unlinkSync(zipFile);
  fs.rmSync('storage', { recursive: true, force: true });
  assert.strictEqual(imported.cards.size, 1, 'Importing zip should restore cards');

  const buffer = await zipApp.exportZipBuffer();
  const importedBuf = await MemoryApp.importZipBuffer(buffer);
  fs.rmSync('storage', { recursive: true, force: true });
  assert.strictEqual(
    importedBuf.cards.size,
    1,
    'Importing zip buffer should restore cards'
  );

  console.log('All tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

