import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SOP_APP',
  description: 'Sistema de apoio ao ciclo de S&OP',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="bg-fundo-principal text-texto-principal">{children}</body>
    </html>
  );
}
