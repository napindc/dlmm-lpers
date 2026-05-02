import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DLMM Elite Wallets",
  description: "Meteora DLMM Wallet Rating Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
