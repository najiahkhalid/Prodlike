// checkout-service: delivery fees for Kitaab.pk baskets.
const STANDARD_FEE = 150; // Rs
const EXPRESS_SURCHARGE = 200; // Rs, always charged for express delivery
const FREE_DELIVERY_FROM = 1500; // Rs, see ticket KTB-219

/**
 * Delivery fee for a basket.
 * @param {{ total: number, express?: boolean }} order
 * @returns {number} fee in rupees
 */
function deliveryFee(order) {
  // TODO(KTB-219): free standard delivery from Rs 1,500; express always adds Rs 200.
  return STANDARD_FEE;
}

module.exports = { deliveryFee, STANDARD_FEE, EXPRESS_SURCHARGE, FREE_DELIVERY_FROM };
