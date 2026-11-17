// Hidden behavioural checks for KTB-219 (copied in only at scoring time).
const { deliveryFee } = require('../src/delivery');

describe('KTB-219 free delivery', () => {
  test.each([
    [{ total: 0 }, 150],
    [{ total: 1499 }, 150],
    [{ total: 1500 }, 0],
    [{ total: 1501 }, 0],
    [{ total: 4200 }, 0],
  ])('standard %o costs %d', (order, fee) => {
    expect(deliveryFee(order)).toBe(fee);
  });

  test.each([
    [{ total: 1000, express: true }, 350],
    [{ total: 1499, express: true }, 350],
    [{ total: 1500, express: true }, 200],
    [{ total: 3000, express: true }, 200],
  ])('express %o costs %d', (order, fee) => {
    expect(deliveryFee(order)).toBe(fee);
  });

  test('express: false behaves like standard', () => {
    expect(deliveryFee({ total: 1500, express: false })).toBe(0);
  });
});
