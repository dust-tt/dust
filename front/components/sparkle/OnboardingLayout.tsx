import { BarHeader, Page } from "@dust-tt/sparkle";
import Head from "next/head";
import Script from "next/script";
import React from "react";

import { getFaviconPath } from "@app/lib/utils";
import type { LightWorkspaceType } from "@app/types";

export default function OnboardingLayout({
  owner,
  headerTitle,
  headerRightActions,
  children,
}: {
  owner: LightWorkspaceType;
  headerTitle: string;
  headerRightActions: React.ReactNode;
  children: React.ReactNode;
}) {
  const faviconPath = getFaviconPath();

  return (
    <>
      <Head>
        <title>{`Dust - ${owner.name || "Onboarding"}`}</title>
        <link rel="icon" type="image/png" href={faviconPath} />

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

      <Script id="google-tag-manager" strategy="beforeInteractive">
        {`
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','${process.env.NEXT_PUBLIC_GTM_TRACKING_ID}');
          (function(){var g=new URLSearchParams(window.location.search).get('gclid');g&&sessionStorage.setItem('gclid',g);})();
        `}
      </Script>

      <Page>
        <BarHeader title={headerTitle} rightActions={headerRightActions} />
        {children}
      </Page>
    </>
  );
}
