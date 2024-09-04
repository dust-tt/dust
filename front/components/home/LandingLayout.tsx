import {
  Button,
  Div3D,
  Hover3D,
  LoginIcon,
  LogoHorizontalColorLayer1Logo,
  LogoHorizontalColorLayer2Logo,
  LogoHorizontalColorLogo,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Script from "next/script";
import { useEffect, useState } from "react";
import { useCookies } from "react-cookie";

import RootLayout from "@app/components/app/RootLayout";
import { A } from "@app/components/home/ContentComponents";
import { FooterNavigation } from "@app/components/home/menu/FooterNavigation";
import { MainNavigation } from "@app/components/home/menu/MainNavigation";
import { MobileNavigation } from "@app/components/home/menu/MobileNavigation";
import Particles, { shapeNamesArray } from "@app/components/home/Particles";
import ScrollingHeader from "@app/components/home/ScrollingHeader";
import { ClientSideTracking } from "@app/lib/tracking/client";
import { classNames } from "@app/lib/utils";

export interface LandingLayoutProps {
  shape: number;
  gaTrackingId: string;
  postLoginReturnToUrl?: string;
}

export default function LandingLayout({
  children,
  pageProps,
}: {
  children: React.ReactNode;
  pageProps: LandingLayoutProps;
}) {
  const {
    gaTrackingId,
    postLoginReturnToUrl = "/api/login",
    shape,
  } = pageProps;

  const router = useRouter();
  const [currentShape, setCurrentShape] = useState(shape);
  const [showCookieBanner, setShowCookieBanner] = useState<boolean>(true);
  const [hasAcceptedCookies, setHasAcceptedCookies] = useState<boolean>(false);

  const [acceptedCookie, setAcceptedCookie, removeAcceptedCookie] = useCookies([
    "dust-cookies-accepted",
  ]);
  useEffect(() => {
    if (acceptedCookie["dust-cookies-accepted"]) {
      setHasAcceptedCookies(true);
      setShowCookieBanner(false);
    }
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

  useEffect(() => {
    ClientSideTracking.trackPageView({
      pathname: router.pathname,
    });
  }, [router.pathname]);

  return (
    <RootLayout>
      <Header />
      <ScrollingHeader>
        <div className="flex h-full w-full items-center gap-4 px-6 lg:gap-10">
          <div className="hidden h-[24px] w-[96px] lg:block">
            <Link href="/">
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
          <div className="block lg:hidden">
            <LogoHorizontalColorLogo className="h-[24px] w-[96px]" />
          </div>
          <MainNavigation />
          <div className="flex flex-grow justify-end">
            <Button
              variant="tertiary"
              size="sm"
              label="Sign in"
              icon={LoginIcon}
              onClick={() => {
                window.location.href = `/api/auth/login?returnTo=${postLoginReturnToUrl}`;
              }}
            />
          </div>
        </div>
      </ScrollingHeader>
      {/* Keeping the background dark */}
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-slate-900" />
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
            setAcceptedCookie("dust-cookies-accepted", "true");
            setHasAcceptedCookies(true);
            setShowCookieBanner(false);
          }}
          onClickRefuse={() => {
            removeAcceptedCookie("dust-cookies-accepted");
            setShowCookieBanner(false);
          }}
        />
        {hasAcceptedCookies && (
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
        )}
        <FooterNavigation />
      </main>
    </RootLayout>
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
  return (
    <Transition
      show={show}
      enter="transition-opacity s-duration-300"
      appear={true}
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-opacity duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
      className={classNames(
        "z-30 flex w-64 flex-col gap-3 rounded-xl border border-structure-100 bg-white p-4 shadow-xl",
        className || ""
      )}
    >
      <div className="text-sm font-normal text-element-900">
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
          variant="tertiary"
          size="sm"
          label="Reject"
          onClick={onClickRefuse}
        />
        <Button
          variant="primary"
          size="sm"
          label="Accept All"
          onClick={onClickAccept}
        />
      </div>
    </Transition>
  );
};

const Header = () => {
  return (
    <Head>
      <title>Dust - Build custom AI assistants to speed up your work</title>
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
        content="The way we work is changing. Break down knowledge silos and amplify team performance with data-augmented, customizable and secure AI assistants."
      />
      <meta
        id="og-title"
        property="og:title"
        content="Dust - Build custom AI assistants to speed up your work"
      />
      <meta id="og-image" property="og:image" content="/static/og_image.png" />

      <link rel="stylesheet" href="https://use.typekit.net/lzv1deb.css"></link>
    </Head>
  );
};
