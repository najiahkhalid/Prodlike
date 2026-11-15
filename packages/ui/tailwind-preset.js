/**
 * Prodlike design tokens, ported 1:1 from the A2 prototype (prototype/assets/styles.css).
 * Primary indigo = brand and actions · Secondary navy = headings, sidebar, dark workspace ·
 * Accent cyan = "live" activity · Status colours are ONLY for system state, always with icon + label.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#4F46E5', hover: '#4338CA', tint: '#EEF2FF' },
        secondary: { DEFAULT: '#0F172A' },
        accent: { DEFAULT: '#06B6D4', text: '#0E7490', tint: '#ECFEFF', live: '#22D3EE' },
        ok: { DEFAULT: '#16A34A', dark: '#22C55E', tint: '#DCFCE7', text: '#166534' },
        warn: { DEFAULT: '#D97706', dark: '#F59E0B', tint: '#FEF3C7', text: '#92400E' },
        bad: { DEFAULT: '#DC2626', dark: '#F87171', tint: '#FEE2E2', text: '#991B1B' },
        surface: { DEFAULT: '#FFFFFF', bg: '#F8FAFC', border: '#E2E8F0' },
        ink: { DEFAULT: '#0F172A', body: '#334155', muted: '#64748B' },
        console: {
          bg: '#0B1120',
          panel: '#0F172A',
          raised: '#1E293B',
          line: '#273449',
          text: '#E2E8F0',
          muted: '#94A3B8',
        },
      },
      fontFamily: {
        head: ['var(--font-head)', 'Segoe UI', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Consolas', 'monospace'],
      },
      borderRadius: { sm: '6px', DEFAULT: '10px', lg: '16px' },
      boxShadow: { card: '0 1px 2px rgba(15,23,42,.06), 0 4px 16px rgba(15,23,42,.06)' },
    },
  },
};
