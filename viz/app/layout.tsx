import type { Metadata } from "next";
import localFont from "next/font/local";
import { Inter } from "next/font/google";

import "./styles/globals.css";

const geist = localFont({
  src: [
    {
      path: "./static/fonts/Geist-Thin.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "./static/fonts/Geist-ThinItalic.woff2",
      weight: "100",
      style: "italic",
    },
    {
      path: "./static/fonts/Geist-ExtraLight.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "./static/fonts/Geist-ExtraLightItalic.woff2",
      weight: "200",
      style: "italic",
    },
    {
      path: "./static/fonts/Geist-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "./static/fonts/Geist-LightItalic.woff2",
      weight: "300",
      style: "italic",
    },
    {
      path: "./static/fonts/Geist-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./static/fonts/Geist-RegularItalic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "./static/fonts/Geist-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./static/fonts/Geist-MediumItalic.woff2",
      weight: "500",
      style: "italic",
    },
    {
      path: "./static/fonts/Geist-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./static/fonts/Geist-SemiBoldItalic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "./static/fonts/Geist-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "./static/fonts/Geist-BoldItalic.woff2",
      weight: "700",
      style: "italic",
    },
    {
      path: "./static/fonts/Geist-ExtraBold.woff2",
      weight: "800",
      style: "normal",
    },
    {
      path: "./static/fonts/Geist-ExtraBoldItalic.woff2",
      weight: "800",
      style: "italic",
    },
    {
      path: "./static/fonts/Geist-Black.woff2",
      weight: "900",
      style: "normal",
    },
    {
      path: "./static/fonts/Geist-BlackItalic.woff2",
      weight: "900",
      style: "italic",
    },
  ],
  variable: "--font-geist",
});

const geistMono = localFont({
  src: [
    {
      path: "./static/fonts/GeistMono-Thin.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "./static/fonts/GeistMono-UltraLight.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "./static/fonts/GeistMono-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "./static/fonts/GeistMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./static/fonts/GeistMono-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./static/fonts/GeistMono-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./static/fonts/GeistMono-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "./static/fonts/GeistMono-UltraBlack.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-geist-mono",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Dust Viz",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${geist.className} ${geistMono.className} ${inter.variable} ${inter.className}`}
    >
      <body>{children}</body>
    </html>
  );
}
