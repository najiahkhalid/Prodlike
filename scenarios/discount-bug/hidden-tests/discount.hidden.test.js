// Hidden correctness checks: copied into the sandbox only when the attempt is scored.
// They test behaviour, not text, so any valid fix passes (FR-14).
const { applyDiscount } = require('../src/discount');

describe('hidden: discount boundary', () => {
  test.each([
    [0, 0],
    [999, 999],
    [1000, 900],
    [1001, 900.9],
    [2500, 2250],
  ])('total %p -> %p', (total, expected) => {
    expect(applyDiscount({ total })).toBeCloseTo(expected, 5);
  });
});
