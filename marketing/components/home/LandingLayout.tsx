import type { CookieConsentChoices } from "@marketing/components/home/CookieBanner";
import { CookieBanner } from "@marketing/components/home/CookieBanner";
import { LogoListsProvider } from "@marketing/components/home/LogoListsContext";
import { FooterNavigation } from "@marketing/components/home/menu/FooterNavigation";
import { MainNavigation } from "@marketing/components/home/menu/MainNavigation";
import { MobileNavigation } from "@marketing/components/home/menu/MobileNavigation";
import { OpenDustButton } from "@marketing/components/home/OpenDustButton";
import { PromoBanner } from "@marketing/components/home/PromoBanner";
import { PublicWebsiteLogo } from "@marketing/components/home/PublicWebsiteLogo";
import ScrollingHeader from "@marketing/components/home/ScrollingHeader";
import { SkipLandingPrompt } from "@marketing/components/home/SkipLandingPrompt";
import UTMButton from "@marketing/components/UTMButton";
import { useStripUtmParams } from "@marketing/hooks/useStripUtmParams";
import {
  CONSENT_COOKIE_OPTIONS,
  DUST_COOKIES_ACCEPTED,
  DUST_HAS_SESSION,
  DUST_SESSION_REPLAY_CONSENT,
  hasCookiesAccepted,
  hasExplicitAnalyticsConsent,
  hasSessionIndicator,
  hasSessionReplayConsent,
  shouldCheckGeolocation,
} from "@marketing/lib/cookies";
import type { LogoListMap } from "@marketing/lib/logo_bars";
import { useGeolocation } from "@marketing/lib/swr/geo";
import { useLandingAuthContext } from "@marketing/lib/swr/website";
import { TRACKING_AREAS, withTracking } from "@marketing/lib/tracking";
import { classNames, getFaviconPath } from "@marketing/lib/utils";
import { getOrCreateAnonymousId } from "@marketing/lib/utils/anonymous_id";
import { appendUTMParams } from "@marketing/lib/utils/utm";
import { Button } from "@dust-tt/sparkle";
import Head from "next/head";
import { useRouter } from "next/router";
import Script from "next/script";
import { useSignUpModal } from "@marketing/hooks/useSignUpModal";
import { useCallback, useEffect, useState } from "react";
import { useCookies } from "react-cookie";

export interface LandingLayoutProps {
  shape: number;
  postLoginReturnToUrl?: string;
  gtmTrackingId?: string;
  hideNavigation?: boolean;
  fullWidth?: boolean;
  // Editor-managed customer logo lists from Contentful, one per region,
  // fetched in the page's `getStaticProps`. Absent on pages that render no
  // logo bar; the bars fall back to their hardcoded lineup when it's missing.
  logoLists?: LogoListMap;
}

export default function LandingLayout({
  children,
  pageProps,
}: {
  children: React.ReactNode;
  pageProps: LandingLayoutProps;
}) {
  const {
    postLoginReturnToUrl = "/api/login",
    gtmTrackingId,
    hideNavigation,
    fullWidth,
    logoLists,
  } = pageProps;

  const { openSignUpModal } = useSignUpModal();

  const router = useRouter();

  useStripUtmParams();

  const [cookies, setCookie] = useCookies(
    [DUST_COOKIES_ACCEPTED, DUST_HAS_SESSION, DUST_SESSION_REPLAY_CONSENT],
    {
      doNotParse: true,
    }
  );
  const [showCookieBanner, setShowCookieBanner] = useState<boolean>(false);
  // Only opened by the visitor through the footer "Cookie Settings" control.
  const [isCookieSettingsOpen, setIsCookieSettingsOpen] =
    useState<boolean>(false);
  const cookieValue = cookies[DUST_COOKIES_ACCEPTED];
  const replayCookieValue = cookies[DUST_SESSION_REPLAY_CONSENT];
  const [hasAcceptedCookies, setHasAcceptedCookies] = useState<boolean>(
    hasCookiesAccepted(cookieValue, null)
  );

  // Check session cookie only on client to avoid hydration mismatch.
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    setHasSession(hasSessionIndicator(cookies[DUST_HAS_SESSION]));
  }, [cookies]);

  // Verify actual auth state when session cookie is present. SWR deduplicates
  // this call with the one in OpenDustButton, so there's no extra request.
  const { isAuthenticated, isLoading: isAuthLoading } = useLandingAuthContext({
    hasSessionCookie: hasSession,
  });

  const shouldCheckGeo = shouldCheckGeolocation(cookieValue);

  const { geoData, isGeoDataLoading } = useGeolocation({
    disabled: !shouldCheckGeo,
  });

  const saveConsentChoices = useCallback(
    ({ analytics, replay }: CookieConsentChoices) => {
      setHasAcceptedCookies(analytics);
      setShowCookieBanner(false);
      setIsCookieSettingsOpen(false);
      setCookie(
        DUST_COOKIES_ACCEPTED,
        analytics ? "true" : "false",
        CONSENT_COOKIE_OPTIONS
      );
      // Replay requires analytics consent.
      setCookie(
        DUST_SESSION_REPLAY_CONSENT,
        analytics && replay ? "granted" : "denied",
        CONSENT_COOKIE_OPTIONS
      );
    },
    [setCookie]
  );

  // If you come back to the public site (e.g. pricing page) with browser's back button from the app,
  // you can have dark theme so we need to remove them manually
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    if (cookieValue !== undefined) {
      setShowCookieBanner(false);
      return;
    }

    if (isGeoDataLoading) {
      return;
    }

    if (geoData && geoData.isGDPR === false) {
      // For non-GDPR countries (like US), show banner and set cookies to auto
      setShowCookieBanner(true);
      setHasAcceptedCookies(true); // Enable cookies immediately for non-GDPR
      getOrCreateAnonymousId();
    } else {
      // For GDPR countries, just show the banner
      setShowCookieBanner(true);
    }
  }, [geoData, isGeoDataLoading, cookieValue]);

  return (
    <LogoListsProvider logoLists={logoLists}>
      <Header />
      {hideNavigation ? (
        <div className="flex w-full justify-center pt-12 pb-2">
          <div className="container flex items-center justify-center px-6">
            <PublicWebsiteLogo />
          </div>
        </div>
      ) : (
        <>
          <ScrollingHeader hasBanner={false}>
            <div className="flex h-full w-full items-center gap-4 px-2 xs:px-6 xl:gap-10">
              <div className="hidden h-[24px] w-[96px] xl:block">
                <PublicWebsiteLogo />
              </div>
              <MobileNavigation />
              <div className="block xl:hidden">
                <PublicWebsiteLogo />
              </div>
              <MainNavigation />
              <div className="relative flex flex-grow items-center justify-end gap-1 xs:gap-4">
                {hasSession && (isAuthLoading || isAuthenticated) ? (
                  <>
                    <OpenDustButton
                      variant="highlight"
                      size="sm"
                      trackingArea={TRACKING_AREAS.NAVIGATION}
                      trackingObject="go_to_app"
                    />
                    {/* The opt-in only affects the root, which is the only page
                        that redirects to the app. */}
                    {router.pathname === "/" && <SkipLandingPrompt />}
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      label="Sign in"
                      href={appendUTMParams(
                        `/api/workos/login?returnTo=${encodeURIComponent(postLoginReturnToUrl)}`
                      )}
                      onClick={withTracking(
                        TRACKING_AREAS.NAVIGATION,
                        "sign_in"
                      )}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      label="Try for free"
                      onClick={withTracking(
                        TRACKING_AREAS.NAVIGATION,
                        "sign_up",
                        openSignUpModal
                      )}
                    />
                    <div className="hidden xs:inline-flex">
                      <UTMButton
                        href="/home/contact"
                        variant="highlight"
                        size="sm"
                        label="Contact sales"
                        onClick={withTracking(
                          TRACKING_AREAS.NAVIGATION,
                          "contact_sales"
                        )}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </ScrollingHeader>
        </>
      )}
      <main className="z-10 flex w-full flex-col items-center">
        <div
          className={classNames(
            "flex w-full flex-col",
            fullWidth ? "" : "container",
            "gap-6 px-6 md:gap-24",
            hideNavigation ? "pt-6" : "pt-[96px]",
            "xl:gap-16",
            "2xl:gap-24"
          )}
        >
          {children}
        </div>
        <PromoBanner />
        {(showCookieBanner || isCookieSettingsOpen) && (
          <CookieBanner
            // Remount when switching modes so the switches reset to the saved choices.
            key={isCookieSettingsOpen ? "settings" : "first-visit"}
            className="fixed bottom-0 left-0 z-50 w-full"
            mode={isCookieSettingsOpen ? "settings" : "first-visit"}
            savedChoices={{
              // Only explicit choices pre-fill the switches: saving preferences
              // must never turn analytics or replay on by itself.
              analytics: hasExplicitAnalyticsConsent(cookieValue),
              replay:
                hasExplicitAnalyticsConsent(cookieValue) &&
                hasSessionReplayConsent(replayCookieValue),
            }}
            onSave={saveConsentChoices}
            onCancel={() => setIsCookieSettingsOpen(false)}
          />
        )}
        {hasAcceptedCookies && (
          <Script id="google-tag-manager" strategy="afterInteractive">
            {`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtmTrackingId}');
            `}
          </Script>
        )}
        {cookieValue === "true" && (
          // Marketing tier requires explicit Accept; skip the geo-based "auto" consent path.
          <Script
            id="claydar"
            src="https://static.claydar.com/init.v1.js?id=clmYho8v0U"
            strategy="afterInteractive"
          />
        )}
        {!hideNavigation && (
          <FooterNavigation
            onOpenCookieSettings={() => setIsCookieSettingsOpen(true)}
          />
        )}
      </main>
    </LogoListsProvider>
  );
}

const Header = () => {
  const faviconPath = getFaviconPath();

  return (
    <Head>
      <link rel="icon" type="image/png" href={faviconPath} />
      <link
        rel="preload"
        href="/static/fonts/GeistVariable.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
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
    </Head>
  );
};
