import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import { Header } from "@/components/header";
import "./globals.css";

// Anton (SIL Open Font License, see src/fonts/ANTON-OFL.txt), the gig-poster display face.
const anton = localFont({ src: "../fonts/anton.woff2", variable: "--font-anton", display: "swap" });

export const metadata: Metadata = {
  title: { default: "TicketRush", template: "%s · TicketRush" },
  description: "Event ticketing built for flash-sale ticket drops: fair queues, no double-sold seats, automatic refunds.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${anton.variable}`}>
      <body className="min-h-screen antialiased">
        <Header />
        {children}
      </body>
    </html>
  );
}
