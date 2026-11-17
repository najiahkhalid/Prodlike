// trips-service: fare calculation for RideMate.
const BASE_FARE = 100; // Rs
const PER_KM = 45; // Rs
const MIN_FARE = 200; // Rs, policy RM-3304
const MAX_SURGE = 2.0; // policy RM-3304

/**
 * Fare for a trip, in whole rupees.
 * @param {{ km: number, surge?: number }} trip distance and the surge multiplier at booking time
 * @returns {number}
 */
function fare(trip) {
  const raw = (BASE_FARE + PER_KM * trip.km) * trip.surge;
  return Math.round(raw);
}

module.exports = { fare, BASE_FARE, PER_KM, MIN_FARE, MAX_SURGE };
