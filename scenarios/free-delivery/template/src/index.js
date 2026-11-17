// checkout-service HTTP entry point (read-only in this scenario).
// Note: the sandbox has no network, so this file is for reading, not for running.
const http = require('http');
const { deliveryFee } = require('./delivery');
const catalogue = require('./catalogue-client');

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/checkout/quote') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const basket = JSON.parse(body);
    const books = await catalogue.lookup(basket.bookIds);
    const total = books.reduce((sum, b) => sum + b.price, 0);
    const fee = deliveryFee({ total, express: Boolean(basket.express) });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ total, deliveryFee: fee, payable: total + fee }));
    return;
  }
  res.writeHead(404).end();
});

if (require.main === module) server.listen(3000);
module.exports = { server };
