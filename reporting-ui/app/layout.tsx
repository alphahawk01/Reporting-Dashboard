import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/Topbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Premier Data Platform",
  description: "Premier Data Operations Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-screen overflow-hidden bg-slate-950 text-white">

        <div className="flex h-full">

          <Sidebar />

          <div className="flex flex-1 flex-col overflow-hidden">

            <TopBar />

            <main className="flex-1 overflow-auto">
              {children}
            </main>

          </div>

        </div>

      </body>
    </html>
  );
}