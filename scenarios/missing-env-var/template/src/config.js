// Reads notifications-service configuration at start-up (read-only in this scenario).
// A missing required variable stops the process on purpose: better no SMS than SMS to nowhere.
const REQUIRED = ['SMS_PROVIDER', 'SMS_GATEWAY_URL', 'SMS_API_KEY', 'SMS_SENDER_ID'];

function loadConfig(env = process.env) {
  for (const name of REQUIRED) {
    if (!env[name]) throw new Error(`Missing required env var ${name}`);
  }
  return {
    provider: env.SMS_PROVIDER,
    gatewayUrl: env.SMS_GATEWAY_URL,
    apiKey: env.SMS_API_KEY,
    senderId: env.SMS_SENDER_ID,
    timeoutMs: Number(env.SMS_TIMEOUT_MS || 3000),
  };
}

module.exports = { loadConfig, REQUIRED };
