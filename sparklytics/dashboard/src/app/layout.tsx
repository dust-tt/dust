import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Sidebar } from "@/components/nav/Sidebar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Sparkle Analytics",
  description: "Design system usage analytics for @dust-tt/sparkle",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="bg-gray-950 text-gray-50 font-sans antialiased">
        <Sidebar />
        <main className="mt-14 min-h-screen p-6 mx-auto max-w-7xl">{children}</main>
      </body>
    </html>
  );
}
