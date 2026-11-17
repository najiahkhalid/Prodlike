const { fare } = require('../src/fare');

test('a 10 km trip without surge', () => {
  expect(fare({ km: 10, surge: 1 })).toBe(550);
});

test('a 10 km trip at 1.5x surge', () => {
  expect(fare({ km: 10, surge: 1.5 })).toBe(825);
});

// TODO(RM-3304): surge above 2.0x, below 1.0x and missing; trips below the Rs 200 minimum
