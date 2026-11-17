// Hidden behavioural checks for PD-1107 (copied in only at scoring time).
const { normalisePhone } = require('../src/phone');

describe('PD-1107 phone normalisation', () => {
  test.each([
    '03001234567',
    '0300-1234567',
    '0300 1234567',
    '0300 123 4567',
    '+92 300 1234567',
    '+92-300-1234567',
    '923001234567',
    '+923001234567',
    '  0300-1234567  ',
  ])('%s becomes +923001234567', (raw) => {
    expect(normalisePhone(raw)).toBe('+923001234567');
  });

  test('other mobile networks work too', () => {
    expect(normalisePhone('0345-9876543')).toBe('+923459876543');
  });

  test.each(['', '12345', '0300-123456', '0300-12345678', '04235761234', 'call me', '+44 7911 123456'])(
    '%p is not a Pakistani mobile number',
    (raw) => {
      expect(normalisePhone(raw)).toBeNull();
    },
  );

  test('non-strings are rejected', () => {
    expect(normalisePhone(undefined)).toBeNull();
    expect(normalisePhone(3001234567)).toBeNull();
  });
});
