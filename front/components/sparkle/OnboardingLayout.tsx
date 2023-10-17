import Head from "next/head";
import Script from "next/script";
import { useRef } from "react";
import React from "react";

import Particles from "@app/components/home/particles";
import { WorkspaceType } from "@app/types/user";

export default function OnboardingLayout({
  owner,
  gaTrackingId,
  children,
}: {
  owner?: WorkspaceType;
  gaTrackingId: string;
  children: React.ReactNode;
}) {
  const scrollRef1 = useRef<HTMLDivElement | null>(null);
  const scrollRef2 = useRef<HTMLDivElement | null>(null);
  const scrollRef3 = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <Head>
        <title>{`Dust - ${owner?.name || "Onboarding"}`}</title>
        <link rel="shortcut icon" href="/static/favicon.png" />

        <meta name="apple-mobile-web-app-title" content="Dust" />
        <link rel="apple-touch-icon" href="/static/AppIcon.png" />
        <link
          rel="apple-touch-icon"
          sizes="60x60"
          href="/static/AppIcon_60.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="76x76"
          href="/static/AppIcon_76.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="120x120"
          href="/static/AppIcon_120.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href="/static/AppIcon_152.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="167x167"
          href="/static/AppIcon_167.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/static/AppIcon_180.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="192x192"
          href="/static/AppIcon_192.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="228x228"
          href="/static/AppIcon_228.png"
        />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
      </Head>

      {/* Keeping the background dark */}
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-slate-800" />
      {/* Particle system */}
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-40 overflow-hidden">
        <Particles
          scrollRef1={scrollRef1}
          scrollRef2={scrollRef2}
          scrollRef3={scrollRef3}
        />
      </div>

      <div className="s-dark text-slate-200">
        <main className="z-10 mx-auto max-w-4xl px-6 pt-32">{children}</main>
      </div>
      <>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${gaTrackingId}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
  
            gtag('config', '${gaTrackingId}');
            `}
        </Script>
      </>
    </>
  );
}
