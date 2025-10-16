import {
  Button,
  Div3D,
  DustLogo,
  DustLogoLayer1,
  DustLogoLayer2,
  Hover3D,
  LoginIcon,
} from "@dust-tt/sparkle";
import { cva } from "class-variance-authority";
import Head from "next/head";
import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useState } from "react";
import { useCookies } from "react-cookie";

import { A } from "@app/components/home/ContentComponents";
import { FooterNavigation } from "@app/components/home/menu/FooterNavigation";
import { MainNavigation } from "@app/components/home/menu/MainNavigation";
import { MobileNavigation } from "@app/components/home/menu/MobileNavigation";
import ScrollingHeader from "@app/components/home/ScrollingHeader";
import UTMButton from "@app/components/UTMButton";
import UTMHandler from "@app/components/UTMHandler";
import {
  DUST_COOKIES_ACCEPTED,
  hasCookiesAccepted,
  shouldCheckGeolocation,
} from "@app/lib/cookies";
import { useGeolocation } from "@app/lib/swr/geo";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { classNames, getFaviconPath } from "@app/lib/utils";

export interface LandingLayoutProps {
  shape: number;
  postLoginReturnToUrl?: string;
  gtmTrackingId?: string;
  utmParams?: { [key: string]: string | string[] | undefined };
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
    utmParams,
  } = pageProps;

  const [cookies, setCookie] = useCookies([DUST_COOKIES_ACCEPTED], {
    doNotParse: true,
  });
  const [showCookieBanner, setShowCookieBanner] = useState<boolean>(false);
  const cookieValue = cookies[DUST_COOKIES_ACCEPTED];
  const [hasAcceptedCookies, setHasAcceptedCookies] = useState<boolean>(
    hasCookiesAccepted(cookieValue, null)
  );

  const shouldCheckGeo = shouldCheckGeolocation(cookieValue);

  const { geoData, isGeoDataLoading } = useGeolocation({
    disabled: !shouldCheckGeo,
  });

  const setCookieApproval = useCallback(
    (type: "true" | "auto" | "false") => {
      // true is when the user accepts all cookies.
      // auto is when not in GDPR region
      if (type === "true" || type === "auto") {
        setHasAcceptedCookies(true);
      }
      setShowCookieBanner(false);
      setCookie(DUST_COOKIES_ACCEPTED, type, {
        path: "/",
        maxAge: 183 * 24 * 60 * 60, // 6 months
        sameSite: "lax",
      });
    },
    [setCookie]
  );

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
      // Note: We don't set the cookie value here, letting the user choose to accept/reject
    } else {
      // For GDPR countries, just show the banner
      setShowCookieBanner(true);
    }
  }, [geoData, isGeoDataLoading, cookieValue]);

  return (
    <>
      <Header />
      {/* Handle UTM parameter storage */}
      {utmParams && <UTMHandler utmParams={utmParams} />}
      <ScrollingHeader>
        <div className="flex h-full w-full items-center gap-4 px-6 xl:gap-10">
          <div className="hidden h-[24px] w-[96px] xl:block">
            <PublicWebsiteLogo />
          </div>
          <MobileNavigation />
          <div className="block xl:hidden">
            <Link href="/">
              <DustLogo className="h-[24px] w-[96px]" />
            </Link>
          </div>
          <MainNavigation />
          <div className="flex flex-grow justify-end gap-4">
            <UTMButton
              href="/home/contact"
              className="hidden xs:inline-flex"
              variant="outline"
              size="sm"
              label="Request a demo"
              onClick={withTracking(TRACKING_AREAS.NAVIGATION, "request_demo")}
            />
            <Button
              variant="highlight"
              size="sm"
              label="Sign in"
              icon={LoginIcon}
              onClick={withTracking(
                TRACKING_AREAS.NAVIGATION,
                "sign_in",
                () => {
                  window.location.href = `/api/workos/login?returnTo=${encodeURIComponent(postLoginReturnToUrl)}`;
                }
              )}
            />
          </div>
        </div>
      </ScrollingHeader>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50" />
      <div className="fixed inset-0 -z-30" />
      {/* <div className="fixed bottom-0 left-0 right-0 top-0 -z-40 overflow-hidden transition duration-1000">
        <Particles currentShape={currentShape} />
      </div> */}
      <main className="z-10 flex flex-col items-center">
        <div
          className={classNames(
            "container flex w-full flex-col",
            "gap-24 px-6 py-24 pb-12",
            "xl:gap-16",
            "2xl:gap-24"
          )}
        >
          {children}
        </div>
        <CookieBanner
          className="fixed bottom-0 left-0 z-50 w-full"
          show={showCookieBanner}
          onClickAccept={() => {
            setCookieApproval("true");
          }}
          onClickRefuse={() => {
            setCookieApproval("false");
          }}
        />
        {hasAcceptedCookies && (
          <Script id="google-tag-manager" strategy="afterInteractive">
            {`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtmTrackingId}');
              (function(){
                var utmParams = {};
                var urlParams = new URLSearchParams(window.location.search);
                ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'msclkid'].forEach(function(param) {
                  var value = urlParams.get(param);
                  if (value) {
                    utmParams[param] = value;
                    sessionStorage.setItem(param, value);
                  }
                });
              })();
            `}
          </Script>
        )}
        <FooterNavigation />
      </main>
    </>
  );
}

const CookieBanner = ({
  show,
  onClickAccept,
  onClickRefuse,
  className,
}: {
  show: boolean;
  onClickAccept: () => void;
  onClickRefuse: () => void;
  className?: string;
}) => {
  const [isVisible, setIsVisible] = useState(show);

  useEffect(() => {
    setIsVisible(show);
  }, [show]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={classNames(
        "fixed bottom-0 left-0 z-30 flex w-full flex-col items-center justify-between gap-6 border-t border-slate-700 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-sm md:flex-row md:gap-8",
        "s-transition-opacity s-duration-300 s-ease-in-out",
        isVisible ? "s-opacity-100" : "s-opacity-0",
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        className || ""
      )}
    >
      <div className="flex max-w-2xl flex-col gap-2">
        <div className="text-base font-medium text-white md:text-lg">
          We use cookies
        </div>
        <div className="text-sm font-normal text-slate-300 md:text-base">
          By clicking "Accept All Cookies", you agree to the storing of cookies
          on your device to enhance site navigation, analyze site usage, and
          assist in our marketing efforts. You can also{" "}
          <button
            className="text-slate-400 underline transition-colors hover:text-slate-200"
            onClick={() => {
              setIsVisible(false);
              onClickRefuse();
            }}
          >
            reject non-essential cookies
          </button>
          . View our{" "}
          <A variant="primary" href="/home/platform-privacy">
            Privacy Policy
          </A>{" "}
          for more information.
        </div>
      </div>
      <div className="flex shrink-0 gap-3">
        <Button
          variant="highlight"
          size="md"
          label="Accept All Cookies"
          onClick={() => {
            setIsVisible(false);
            onClickAccept();
          }}
        />
      </div>
    </div>
  );
};

const Header = () => {
  const faviconPath = getFaviconPath();

  return (
    <Head>
      <title>Accelerate your entire organization with custom AI agents</title>
      <link rel="icon" type="image/png" href={faviconPath} />
      <link
        rel="preload"
        href="/static/fonts/Geist-Regular.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      <link
        rel="preload"
        href="/static/fonts/Geist-Medium.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      <link
        rel="preload"
        href="/static/fonts/Geist-Bold.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      <link
        rel="preload"
        href="/static/fonts/GeistMono-Medium.woff2"
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

      <meta
        id="meta-description"
        name="description"
        content="The way we work is changing. Break down knowledge silos and amplify team performance with data-augmented, customizable and secure AI agents."
      />
      <meta
        id="og-title"
        property="og:title"
        content="Dust - Accelerate your entire organization with custom AI agents"
      />
      <meta id="og-image" property="og:image" content="/static/og_image.png" />
    </Head>
  );
};

interface PublicWebsiteLogoProps {
  size?: "default" | "small";
}

const logoVariants = cva("", {
  variants: {
    size: {
      default: "h-[24px] w-[96px]",
      small: "h-[20px] w-[80px]",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export const PublicWebsiteLogo = ({
  size = "default",
}: PublicWebsiteLogoProps) => {
  const className = logoVariants({ size });

  return (
    <Link href="/">
      <Hover3D className={`relative ${className}`}>
        <Div3D depth={0} className={className}>
          <DustLogoLayer1 className={className} />
        </Div3D>
        <Div3D depth={25} className="absolute top-0">
          <DustLogoLayer2 className={className} />
        </Div3D>
      </Hover3D>
    </Link>
  );
};
