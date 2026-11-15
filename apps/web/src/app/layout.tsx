import type { Metadata } from 'next';
// Fonts are bundled with the app (no Google Fonts download at build time or in the offline demo).
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Prodlike — Practise real software engineering', template: '%s · Prodlike' },
  description: 'Fix real code, ship it through CI/CD, and handle production incidents in a safe simulation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
