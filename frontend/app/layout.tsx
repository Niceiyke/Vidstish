import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'SermonClipper Timeline',
  description: 'Define sermon highlight segments before rendering clips.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
