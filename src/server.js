const http = require('http');
const fs = require('fs');
const MemoryApp = require('./app');

const ENC_KEY = process.env.ENCRYPTION_KEY || '';
let app = new MemoryApp({ dbPath: process.env.DB_PATH, encryptionKey: ENC_KEY });

function json(req, callback) {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      callback(null, data);
    } catch (e) {
      callback(e);
    }
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'POST' && req.url === '/api/cards') {
    json(req, async (err, data) => {
      if (err) {
        res.writeHead(400);
        return res.end('Invalid JSON');
      }
      try {
        const card = await app.createCard(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(card));
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/audio-note') {
    json(req, async (err, data) => {
      if (err || !data.audio) {
        res.writeHead(400);
        return res.end('Invalid payload');
      }
      try {
        const file = `audio-${Date.now()}.webm`;
        fs.writeFileSync(file, Buffer.from(data.audio, 'base64'));
        const card = await app.createAudioNote(file, {
          title: data.title || 'Audio note',
          contentType: data.contentType,
          duration: data.duration,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(card));
        fs.unlink(file, () => {});
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/video-note') {
    json(req, async (err, data) => {
      if (err || !data.video) {
        res.writeHead(400);
        return res.end('Invalid payload');
      }
      try {
        const file = `video-${Date.now()}.webm`;
        fs.writeFileSync(file, Buffer.from(data.video, 'base64'));
        const card = await app.createVideoNote(file, { title: data.title || 'Video note' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(card));
        fs.unlink(file, () => {});
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/clip') {
    json(req, async (err, data) => {
      if (err || !data.url) {
        res.writeHead(400);
        return res.end('Invalid payload');
      }
      try {
        const card = await app.createCard({
          title: data.title || data.url,
          source: data.url,
          content: data.content || '',
          type: 'link'
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(card));
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/illustrate') {
    json(req, async (err, data) => {
      if (err || !data.prompt) {
        res.writeHead(400);
        return res.end('Invalid payload');
      }
      try {
        const image = await app.generateIllustration(data.prompt);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ image }));
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/search/semantic') {
    json(req, async (err, data) => {
      if (err || !data.query) {
        res.writeHead(400);
        return res.end('Invalid payload');
      }
      try {
        const results = await app.searchBySemantic(data.query, data.limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/chat') {
    json(req, async (err, data) => {
      if (err || !data.query) {
        res.writeHead(400);
        return res.end('Invalid payload');
      }
      try {
        const reply = await app.chat(data.query);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply }));
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
  } else if (req.method === 'GET' && req.url === '/api/cards') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(app.toJSON()));
  } else if (req.method === 'GET' && req.url === '/api/export') {
    app.exportZipBuffer().then(buffer => {
      res.writeHead(200, { 'Content-Type': 'application/zip' });
      res.end(buffer);
    }).catch(e => {
      res.writeHead(500);
      res.end(e.message);
    });
  } else if (req.method === 'POST' && req.url === '/api/import') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        app = await MemoryApp.importZipBuffer(buffer);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
  } else if (req.url === '/api/settings') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          aiEnabled: app.aiEnabled,
          webSuggestionsEnabled: app.webSuggestionsEnabled,
        })
      );
    } else if (req.method === 'POST') {
      json(req, (err, data) => {
        if (err) {
          res.writeHead(400);
          return res.end('Invalid JSON');
        }
        if (typeof data.aiEnabled === 'boolean') {
          app.setAIEnabled(data.aiEnabled);
        }
        if (typeof data.webSuggestionsEnabled === 'boolean') {
          app.setWebSuggestionsEnabled(data.webSuggestionsEnabled);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            aiEnabled: app.aiEnabled,
            webSuggestionsEnabled: app.webSuggestionsEnabled,
          })
        );
      });
    } else {
      res.writeHead(405);
      res.end('Method not allowed');
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}

module.exports = { app, server };
