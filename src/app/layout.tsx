'use client';

import "./globals.css";
import { AuthProvider } from '@/contexts/AuthContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="flex flex-col min-h-screen h-full">
        <AuthProvider>
          <div className="flex-grow">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
