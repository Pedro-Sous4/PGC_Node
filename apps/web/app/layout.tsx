import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'PGC Migration Console',
  description: 'Operacao e acompanhamento de jobs PGC',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
