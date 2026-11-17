const { normalisePhone } = require('../src/phone');

test('a plain 03XXXXXXXXX number gets the +92 prefix', () => {
  expect(normalisePhone('03001234567')).toBe('+923001234567');
});

test('an E.164 number is kept as it is', () => {
  expect(normalisePhone('+923001234567')).toBe('+923001234567');
});

// TODO(PD-1107): numbers typed with dashes or spaces, and the 92 prefix without "+"
