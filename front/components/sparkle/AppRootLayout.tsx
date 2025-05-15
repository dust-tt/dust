import Head from "next/head";
import Script from "next/script";
import React, { useEffect } from "react";

import { WelcomeTourGuideProvider } from "@app/components/assistant/WelcomeTourGuideProvider";
import { QuickStartGuide } from "@app/components/QuickStartGuide";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import { useUser } from "@app/lib/swr/user";

// TODO(2025-04-11 yuka) We need to refactor AppLayout to avoid re-mounting on every page navigation.
// Until then, AppLayout has been split into AppRootLayout and AppContentLayout.
// When you need to use AppContentLayout, add `getLayout` function to your page and wrap the page with AppRootLayout.
export default function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useUser();

  useEffect(() => {
    if (typeof window !== "undefined" && user?.sId) {
      // Identify the user with GTM
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        userId: user.sId,
        event: "userIdentified",
      });

      // Identify the user with Common Room
      if (window.signals) {
        window.signals.identify({
          email: user.email,
          name: user.fullName,
        });
      }
    }
  }, [user?.email, user?.fullName, user?.sId]);

  return (
    <ThemeProvider>
      <WelcomeTourGuideProvider>
        <Head>
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
        {children}
        <QuickStartGuide />
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${process.env.NEXT_PUBLIC_GTM_TRACKING_ID}');
            `}
        </Script>
      </WelcomeTourGuideProvider>
    </ThemeProvider>
  );
}
