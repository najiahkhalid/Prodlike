// Thin client for payments-service (read-only in this scenario).
const TIMEOUT_MS = Number(process.env.PAYMENT_TIMEOUT_MS || 5000);

async function charge(userId, amount) {
  // In production this calls payments-service, which calls the bank with PAYMENT_TIMEOUT_MS.
  return { userId, amount, status: 'charged', timeoutMs: TIMEOUT_MS };
}

module.exports = { charge };
