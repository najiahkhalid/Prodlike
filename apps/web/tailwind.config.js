/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@prodlike/ui/tailwind-preset')],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  plugins: [],
};
