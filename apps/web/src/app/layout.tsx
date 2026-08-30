import { LangProvider } from '../lib/lang-context';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <style>{`
          [dir="rtl"],
          [dir="rtl"] body,
          [dir="rtl"] * {
            font-family: 'Vazirmatn', sans-serif !important;
          }
        `}</style>
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
