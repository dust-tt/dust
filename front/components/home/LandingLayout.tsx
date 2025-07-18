import {
  Button,
  Div3D,
  DustLogo,
  DustLogoLayer1,
  DustLogoLayer2,
  Hover3D,
  LoginIcon,
} from "@dust-tt/sparkle";
import Head from "next/head";
import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useState } from "react";
import { useCookies } from "react-cookie";

import { A } from "@app/components/home/ContentComponents";
import { FooterNavigation } from "@app/components/home/menu/FooterNavigation";
import { MainNavigation } from "@app/components/home/menu/MainNavigation";
import { MobileNavigation } from "@app/components/home/menu/MobileNavigation";
// import Particles, { shapeNamesArray } from "@app/components/home/Particles";
import ScrollingHeader from "@app/components/home/ScrollingHeader";
import { useGeolocation } from "@app/lib/swr/geo";
import { classNames } from "@app/lib/utils";

export interface LandingLayoutProps {
  shape: number;
  postLoginReturnToUrl?: string;
  gtmTrackingId?: string;
}

export default function LandingLayout({
  children,
  pageProps,
}: {
  children: React.ReactNode;
  pageProps: LandingLayoutProps;
}) {
  const { postLoginReturnToUrl = "/api/login", gtmTrackingId } = pageProps;

  const [cookies, setCookie] = useCookies(["dust-cookies-accepted"]);
  const [showCookieBanner, setShowCookieBanner] = useState<boolean>(false);
  const cookieValue = cookies["dust-cookies-accepted"];
  const [hasAcceptedCookies, setHasAcceptedCookies] = useState<boolean>(
    ["true", "auto"].includes(cookieValue)
  );
  const shouldCheckGeo = !cookieValue;

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
      setCookie("dust-cookies-accepted", type, {
        path: "/",
        maxAge: 183 * 24 * 60 * 60, // 6 months
        sameSite: "lax",
      });
    },
    [setCookie]
  );

  useEffect(() => {
    if (cookieValue) {
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
      <ScrollingHeader>
        <div className="flex h-full w-full items-center gap-4 px-6 xl:gap-10">
          <div className="hidden h-[24px] w-[96px] xl:block">
            <Link href="/home">
              <Hover3D className="relative h-[24px] w-[96px]">
                <Div3D depth={0} className="h-[24px] w-[96px]">
                  <DustLogoLayer1 className="h-[24px] w-[96px]" />
                </Div3D>
                <Div3D depth={25} className="absolute top-0">
                  <DustLogoLayer2 className="h-[24px] w-[96px]" />
                </Div3D>
              </Hover3D>
            </Link>
          </div>
          <MobileNavigation />
          <div className="block xl:hidden">
            <Link href="/">
              <DustLogo className="h-[24px] w-[96px]" />
            </Link>
          </div>
          <MainNavigation />
          <div className="flex flex-grow justify-end gap-4">
            <Button
              href="/home/contact"
              className="hidden xs:inline-flex"
              variant="outline"
              size="sm"
              label="Request a demo"
            />
            <Button
              variant="highlight"
              size="sm"
              label="Sign in"
              icon={LoginIcon}
              onClick={() => {
                window.location.href = `/api/workos/login?returnTo=${postLoginReturnToUrl}`;
              }}
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
              (function(){var g=new URLSearchParams(window.location.search).get('gclid');g&&sessionStorage.setItem('gclid',g);})();
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
        "fixed bottom-0 left-0 z-30 flex w-full flex-col items-center justify-between gap-4 border-t border-border bg-blue-100 p-6 shadow-2xl md:flex-row",
        "s-transition-opacity s-duration-300 s-ease-in-out",
        isVisible ? "s-opacity-100" : "s-opacity-0",
        className || ""
      )}
    >
      <div className="text-sm font-normal text-foreground md:text-base">
        We use{" "}
        <A variant="primary">
          <Link
            href="https://dust-tt.notion.site/Cookie-Policy-ec63a7fb72104a7babff1bf413e2c1ec"
            target="_blank"
          >
            cookies
          </Link>
        </A>{" "}
        to improve your experience on our site.
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          label="Reject All"
          onClick={() => {
            setIsVisible(false);
            onClickRefuse();
          }}
        />
        <Button
          variant="highlight"
          size="sm"
          label="Accept All"
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
  return (
    <Head>
      <title>Accelerate your entire organization with custom AI agents</title>
      <link rel="shortcut icon" href="/static/favicon.png" />
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
