const http = require('http');
const fs = require('fs');
const MemoryApp = require('./app');

const app = new MemoryApp();

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
        const card = await app.createAudioNote(file, { title: data.title || 'Audio note' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(card));
        fs.unlink(file, () => {});
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
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
