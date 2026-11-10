import './global.css';
import { LangProvider } from '../lib/lang-context';
import { Toaster } from '@/components/ui/sonner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        {/* jsDelivr fallback for Vazirmatn in case Google Fonts is blocked/throttled in Iran */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
        />
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
