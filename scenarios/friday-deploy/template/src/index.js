// trips-service HTTP entry point (read-only in this scenario).
// Note: the sandbox has no network, so this file is for reading, not for running.
const http = require('http');
const { fare } = require('./fare');

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/trips/quote') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { km, surge } = JSON.parse(body);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ fare: fare({ km, surge }) }));
    return;
  }
  res.writeHead(404).end();
});

if (require.main === module) server.listen(3000);
module.exports = { server };
