const { applyDiscount } = require('../src/discount');

test('no discount below Rs 1000', () => {
  expect(applyDiscount({ total: 999 })).toBe(999);
});

test('10% off above Rs 1000', () => {
  expect(applyDiscount({ total: 1500 })).toBe(1350);
});

// TODO(BYTE-482): add a test for the boundary case (exactly Rs 1000)
