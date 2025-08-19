import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Providers from '@/components/providers/Providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata = {
  title: 'Admin Dashboard',
  description: 'A modern admin dashboard with Next.js and Firebase',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-primary-50" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans h-full`}>
        <Providers>
          <div className="min-h-full">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
