// Hidden behavioural checks for RM-3304 (copied in only at scoring time).
const { fare } = require('../src/fare');

describe('RM-3304 surge cap', () => {
  test('surge above 2.0x is capped', () => {
    expect(fare({ km: 10, surge: 3.4 })).toBe(1100);
    expect(fare({ km: 10, surge: 2.5 })).toBe(fare({ km: 10, surge: 2 }));
  });

  test('surge of exactly 2.0x is allowed', () => {
    expect(fare({ km: 10, surge: 2 })).toBe(1100);
  });

  test('normal surge is unchanged', () => {
    expect(fare({ km: 10, surge: 1 })).toBe(550);
    expect(fare({ km: 10, surge: 1.5 })).toBe(825);
  });

  test('surge never discounts', () => {
    expect(fare({ km: 10, surge: 0.5 })).toBe(550);
    expect(fare({ km: 10, surge: 0 })).toBe(550);
  });

  test('missing surge means 1.0x', () => {
    expect(fare({ km: 10 })).toBe(550);
  });
});

describe('RM-3304 minimum fare', () => {
  test.each([
    [{ km: 0, surge: 1 }, 200],
    [{ km: 1, surge: 1 }, 200],
    [{ km: 2, surge: 1 }, 200],
    [{ km: 1, surge: 2 }, 290],
    [{ km: 3, surge: 1 }, 235],
  ])('%o costs %d', (trip, expected) => {
    expect(fare(trip)).toBe(expected);
  });
});
