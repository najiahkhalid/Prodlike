// notifications-service HTTP entry point (read-only in this scenario).
// Note: the sandbox has no network, so this file is for reading, not for running.
const http = require('http');
const { loadConfig } = require('./config');
const { normalisePhone } = require('./phone');

const config = loadConfig(); // exits the process if a required variable is missing

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/otp') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { phone, code } = JSON.parse(body);
    const to = normalisePhone(phone);
    if (!to) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not a mobile number' }));
      return;
    }
    await fetch(config.gatewayUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: config.senderId, to, text: `PayDost code: ${code}` }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    res.writeHead(202).end();
    return;
  }
  res.writeHead(404).end();
});

if (require.main === module) server.listen(3000);
module.exports = { server };
