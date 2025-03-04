import {
  Button,
  Div3D,
  Hover3D,
  LoginIcon,
  LogoHorizontalColorLayer1Logo,
  LogoHorizontalColorLayer2Logo,
  LogoHorizontalColorLogo,
} from "@dust-tt/sparkle";
import Head from "next/head";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { useCookies } from "react-cookie";

import { A } from "@app/components/home/ContentComponents";
import { FooterNavigation } from "@app/components/home/menu/FooterNavigation";
import { MainNavigation } from "@app/components/home/menu/MainNavigation";
import { MobileNavigation } from "@app/components/home/menu/MobileNavigation";
import Particles, { shapeNamesArray } from "@app/components/home/Particles";
import ScrollingHeader from "@app/components/home/ScrollingHeader";
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
  const {
    postLoginReturnToUrl = "/api/login",
    shape,
    gtmTrackingId,
  } = pageProps;

  const [acceptedCookie, setAcceptedCookie, removeAcceptedCookie] = useCookies([
    "dust-cookies-accepted",
  ]);
  const [currentShape, setCurrentShape] = useState(shape);
  const [showCookieBanner, setShowCookieBanner] = useState<boolean>(false);
  const [hasAcceptedCookies, setHasAcceptedCookies] = useState<boolean>(false);

  useEffect(() => {
    const hasAccepted = Boolean(acceptedCookie["dust-cookies-accepted"]);
    setHasAcceptedCookies(hasAccepted);
    setShowCookieBanner(!hasAccepted);
  }, [acceptedCookie]);

  useEffect(() => {
    setCurrentShape(shape);
  }, [shape]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setCurrentShape(
          (prevShape) =>
            (prevShape - 1 + shapeNamesArray.length) % shapeNamesArray.length
        );
      } else if (event.key === "ArrowRight") {
        setCurrentShape(
          (prevShape) => (prevShape + 1) % shapeNamesArray.length
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <>
      <Header />
      <ScrollingHeader>
        <div className="flex h-full w-full items-center gap-4 px-6 xl:gap-10">
          <div className="hidden h-[24px] w-[96px] xl:block">
            <Link href="/home">
              <Hover3D className="relative h-[24px] w-[96px]">
                <Div3D depth={0} className="h-[24px] w-[96px]">
                  <LogoHorizontalColorLayer1Logo className="h-[24px] w-[96px]" />
                </Div3D>
                <Div3D depth={25} className="absolute top-0">
                  <LogoHorizontalColorLayer2Logo className="h-[24px] w-[96px]" />
                </Div3D>
              </Hover3D>
            </Link>
          </div>
          <MobileNavigation />
          <div className="block xl:hidden">
            <LogoHorizontalColorLogo className="h-[24px] w-[96px]" />
          </div>
          <MainNavigation />
          <div className="flex flex-grow justify-end gap-4">
            <Button
              href="/home/contact"
              className="hidden xs:block"
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
                window.location.href = `/api/auth/login?prompt=login&returnTo=${postLoginReturnToUrl}`;
              }}
            />
          </div>
        </div>
      </ScrollingHeader>
      {/* Keeping the background dark */}
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-slate-900" />
      <div className="fixed inset-0 -z-30 bg-slate-900/50" />
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-40 overflow-hidden transition duration-1000">
        <Particles currentShape={currentShape} />
      </div>
      <main className="z-10 flex flex-col items-center">
        <div
          className={classNames(
            "container flex w-full flex-col",
            "gap-16 px-6 py-24 pb-12",
            "xl:gap-28",
            "2xl:gap-36"
          )}
        >
          {children}
        </div>
        <CookieBanner
          className="fixed bottom-4 right-4"
          show={showCookieBanner}
          onClickAccept={() => {
            setAcceptedCookie("dust-cookies-accepted", "true", {
              path: "/",
              maxAge: 183 * 24 * 60 * 60, // 6 months in seconds
              sameSite: "lax",
            });
            setHasAcceptedCookies(true);
            setShowCookieBanner(false);
          }}
          onClickRefuse={() => {
            removeAcceptedCookie("dust-cookies-accepted", { path: "/" });
            setShowCookieBanner(false);
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
        "z-30 flex w-64 flex-col gap-3 rounded-xl border border-structure-100 bg-white p-4 shadow-xl",
        "s-transition-opacity s-duration-300 s-ease-in-out",
        isVisible ? "s-opacity-100" : "s-opacity-0",
        className || ""
      )}
    >
      <div className="text-sm font-normal text-foreground">
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
          label="Reject"
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

      <link rel="stylesheet" href="https://use.typekit.net/lzv1deb.css"></link>
    </Head>
  );
};
