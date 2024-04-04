import {
  Button,
  Div3D,
  Hover3D,
  LoginIcon,
  LogoHorizontalColorLogoLayer1,
  LogoHorizontalColorLogoLayer2,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";
import type { InferGetServerSidePropsType } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Script from "next/script";
import type { ParsedUrlQuery } from "querystring";
import React, { useEffect, useState } from "react";
import { useCookies } from "react-cookie";

import { A } from "@app/components/home/components/contentComponents";
import Particles, {
  particuleShapes,
} from "@app/components/home/components/particles";
import ScrollingHeader from "@app/components/home/components/scrollingHeader";
import { ForCustomerSupport } from "@app/components/home/content/ForCustomerSupport";
import { ForMarketing } from "@app/components/home/content/ForMarketing";
import { ForPeople } from "@app/components/home/content/ForPeople";
import { Navigation } from "@app/components/home/content/Navigation";
import { PricingPage } from "@app/components/home/content/PricingPage";
import { ProductPage } from "@app/components/home/content/ProductPage";
import { SecurityPage } from "@app/components/home/content/SecurityPage";
import { SubscriptionContactUsDrawer } from "@app/components/SubscriptionContactUsDrawer";
import { trackPageView } from "@app/lib/amplitude/browser";
import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { classNames } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  gaTrackingId: string;
}>(async (context) => {
  // Fetch session explicitly as this page redirects logged in users to our home page.
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  if (user && user.workspaces.length > 0) {
    let url = `/w/${user.workspaces[0].sId}`;

    if (context.query.inviteToken) {
      url = `/api/login?inviteToken=${context.query.inviteToken}`;
    }

    return {
      redirect: {
        destination: url,
        permanent: false,
      },
    };
  }

  return {
    props: { gaTrackingId: GA_TRACKING_ID },
  };
});

export default function Home({
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState("product");
  const [currentShape, setCurrentShape] = useState(0);

  const changeShape = (newShape: number) => {
    setCurrentShape(newShape);
  };

  const handlePageChange = async (page: string) => {
    await router.push(`/?${page}`, undefined, { shallow: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [showCookieBanner, setShowCookieBanner] = useState<boolean>(true);
  const [hasAcceptedCookies, setHasAcceptedCookies] = useState<boolean>(false);
  const [showContactUsDrawer, setShowContactUsDrawer] =
    useState<boolean>(false);

  const [acceptedCookie, setAcceptedCookie, removeAcceptedCookie] = useCookies([
    "dust-cookies-accepted",
  ]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setCurrentShape(
          (prevShape) => (prevShape - 1) % particuleShapes.length
        );
      } else if (event.key === "ArrowRight") {
        setCurrentShape(
          (prevShape) => (prevShape + 1) % particuleShapes.length
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  useEffect(() => {
    switch (currentPage) {
      case "product":
        changeShape(0);
        break;
      case "pricing":
        changeShape(1);
        break;
      case "security":
        changeShape(1);
        break;
      case "for_customer":
        changeShape(6);
        break;
      case "for_marketing":
        changeShape(2);
        break;
      case "for_people":
        changeShape(5);
        break;
      default:
        changeShape(0);
    }
  }, [currentPage]);

  useEffect(() => {
    if (acceptedCookie["dust-cookies-accepted"]) {
      setHasAcceptedCookies(true);
      setShowCookieBanner(false);
    }
  }, [acceptedCookie]);

  useEffect(() => {
    trackPageView({
      pathname: router.pathname,
    });
  }, [router.pathname]);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const page = queryParams.keys().next().value;
    setCurrentPage(page || "product");
  }, [router.asPath]);

  function getReturnToUrl(routerQuery: ParsedUrlQuery): string {
    let callbackUrl = "/api/login";
    if (routerQuery.inviteToken) {
      callbackUrl += `?inviteToken=${routerQuery.inviteToken}`;
    }
    return callbackUrl;
  }

  return (
    <>
      <SubscriptionContactUsDrawer
        show={showContactUsDrawer}
        onClose={() => {
          setShowContactUsDrawer(false);
        }}
      />
      <Header />
      <ScrollingHeader>
        <div className="flex h-full w-full items-center gap-10 px-6">
          <div className="h-[24px] w-[96px]">
            <Hover3D className="relative h-[24px] w-[96px]">
              <Div3D depth={0} className="h-[24px] w-[96px]">
                <LogoHorizontalColorLogoLayer1 className="h-[24px] w-[96px]" />
              </Div3D>
              <Div3D depth={25} className="absolute top-0">
                <LogoHorizontalColorLogoLayer2 className=" h-[24px] w-[96px]" />
              </Div3D>
            </Hover3D>
          </div>
          <Navigation
            onPageChange={async (page) => {
              await handlePageChange(page);
            }}
            currentPage={currentPage}
          />
          <div className="flex-grow" />
          <Button
            variant="tertiary"
            size="sm"
            label="Sign in"
            icon={LoginIcon}
            onClick={() =>
              (window.location.href = `/api/auth/login?returnTo=${getReturnToUrl(
                router.query
              )}`)
            }
          />
        </div>
      </ScrollingHeader>

      {/* Keeping the background dark */}
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-slate-900" />
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-40 overflow-hidden transition duration-[1000ms]">
        <Particles currentShape={currentShape} />
      </div>

      <main className="z-10 flex flex-col items-center">
        <div
          className={classNames(
            "container flex flex-col",
            "gap-16 py-24",
            "md:gap-28 md:py-36",
            "xl:gap-36 xl:pb-96",
            "2xl:gap-48"
          )}
        >
          {(() => {
            switch (currentPage) {
              case "product":
                return <ProductPage getReturnToUrl={getReturnToUrl} />;
              case "pricing":
                return (
                  <PricingPage
                    getReturnToUrl={getReturnToUrl}
                    setShowContactUsDrawer={setShowContactUsDrawer}
                  />
                );
              case "security":
                return <SecurityPage />;
              case "for_customer":
                return <ForCustomerSupport />;
              case "for_marketing":
                return <ForMarketing />;
              case "for_people":
                return <ForPeople />;
              // case "for_sales":
              //   return <SalesTeamsPage />;
              // case "for_engineering":
              //   return <EngineeringPage />;
              // case "for_data":
              //   return <DataAnalyticsPage />;
              // case "for_hr":
              //   return <HRRecruitingPage />;
              // case "for_product":
              //   return <ProductTeamsPage />;
              // case "for_finance":
              //   return <FinancePage />;
              // case "for_it":
              //   return <ITSecurityPage />;
              default:
                return <ProductPage getReturnToUrl={getReturnToUrl} />;
            }
          })()}
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
        </div>
      </main>
    </>
  );
}

const Header = () => {
  return (
    <Head>
      <title>
        Dust - Amplify your team's potential with customizable and secure AI
        assistants
      </title>
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
        content="Dust is an AI assistant that safely brings the best large language models, continuously updated company knowledge, powerful collaboration applications, and an extensible platform to your team's fingertips."
      />
      <meta
        id="og-title"
        property="og:title"
        content="Dust - Secure AI assistant with your company's knowledge"
      />
      <meta id="og-image" property="og:image" content="/static/og_image.png" />

      <link rel="stylesheet" href="https://use.typekit.net/lzv1deb.css"></link>
    </Head>
  );
};

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
