// orders-service/src/discount.js
// Promo: "10% off on orders of Rs 1,000 or more"

const DISCOUNT_THRESHOLD = 1000; // Rs
const DISCOUNT_RATE = 0.1;

function applyDiscount(order) {
  if (order.total > DISCOUNT_THRESHOLD) {
    return order.total * (1 - DISCOUNT_RATE);
  }
  return order.total;
}

module.exports = { applyDiscount, DISCOUNT_THRESHOLD, DISCOUNT_RATE };
