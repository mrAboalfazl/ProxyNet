import './global.css';
import { LangProvider } from '../lib/lang-context';
import { Toaster } from '@/components/ui/sonner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen antialiased bg-background text-foreground" style={{ margin: 0, padding: 0 }}>
        <LangProvider>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </LangProvider>
      </body>
    </html>
  );
}
