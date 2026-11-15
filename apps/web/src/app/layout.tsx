import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';

// Typography from the A2 design identity: headings / body + UI / code + data.
const head = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-head' });
const body = Inter({ subsets: ['latin'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Prodlike — Practise real software engineering',
  description: 'Fix real code, ship it through CI/CD, and handle production incidents in a safe simulation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${head.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
