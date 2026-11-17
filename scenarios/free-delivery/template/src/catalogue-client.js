// Calls catalogue-service for book prices (read-only in this scenario).
// catalogue-service answers from Redis first; CATALOGUE_CACHE_TTL_SECONDS (deploy/cache.env) controls
// how long a book stays cached before PostgreSQL is asked again.
const CATALOGUE_URL = process.env.CATALOGUE_URL || 'http://catalogue-service.internal';

async function lookup(bookIds) {
  const res = await fetch(`${CATALOGUE_URL}/books?ids=${bookIds.join(',')}`);
  if (!res.ok) throw new Error(`catalogue-service responded ${res.status}`);
  return res.json();
}

module.exports = { lookup };
