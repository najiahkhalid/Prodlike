const { deliveryFee } = require('../src/delivery');

test('standard delivery costs Rs 150 on a small basket', () => {
  expect(deliveryFee({ total: 800 })).toBe(150);
});

// TODO(KTB-219): add tests for the free-delivery boundary (Rs 1,500) and for express delivery
