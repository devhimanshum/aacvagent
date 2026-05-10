import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shipivishta — Maritime CV Management',
  description: 'AI-powered maritime crew CV screening and candidate management platform by Shipivishta Ship Management Pvt Ltd',
  icons: {
    icon: '/logo-mark.svg',
    apple: '/logo-mark.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: '12px',
              fontSize: '13px',
              fontFamily: 'Inter, system-ui, sans-serif',
              boxShadow: '0 8px 24px -4px rgba(7,23,48,0.2), 0 4px 8px -2px rgba(7,23,48,0.1)',
              border: '1px solid rgba(0,0,0,0.06)',
            },
            success: {
              iconTheme: { primary: '#2563eb', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#C0392B', secondary: '#fff' },
            },
          }}
        />
      </body>
    </html>
  );
}
