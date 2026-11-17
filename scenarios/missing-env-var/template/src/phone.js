// notifications-service: phone numbers for OTP SMS.

/**
 * Normalise a Pakistani mobile number to E.164 (+923XXXXXXXXX).
 * Returns null when the input is not a Pakistani mobile number.
 * @param {string} raw what the customer typed
 * @returns {string | null}
 */
function normalisePhone(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (/^03\d{9}$/.test(value)) return `+92${value.slice(1)}`;
  if (/^\+923\d{9}$/.test(value)) return value;
  return null;
}

module.exports = { normalisePhone };
