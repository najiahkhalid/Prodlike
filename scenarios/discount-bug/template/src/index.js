// orders-service HTTP entry point (read-only in this scenario).
// Note: the sandbox has no network, so this file is for reading, not for running.
const http = require('http');
const { applyDiscount } = require('./discount');
const payments = require('./payments-client');

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/orders') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const order = JSON.parse(body);
    const total = applyDiscount(order);
    const receipt = await payments.charge(order.userId, total);
    res.writeHead(201, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ total, receipt }));
    return;
  }
  res.writeHead(404).end();
});

if (require.main === module) server.listen(3000);
module.exports = { server };
