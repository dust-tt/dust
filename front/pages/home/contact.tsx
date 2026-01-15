import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { ContactForm } from "@app/components/home/ContactForm";
import { ContactFormThankYou } from "@app/components/home/ContactFormThankYou";
import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import { Grid } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import TrustedBy from "@app/components/home/TrustedBy";
import UTMPageWrapper from "@app/components/UTMPageWrapper";
import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      isAuthenticated: !!user,
      shape: 0,
    },
  };
};

export default function Contact() {
  const router = useRouter();
  const companyName =
    typeof router.query.company === "string" ? router.query.company : null;
  const prefillEmail =
    typeof router.query.email === "string" ? router.query.email : undefined;
  const prefillHeadcount =
    typeof router.query.company_headcount_form === "string"
      ? router.query.company_headcount_form
      : undefined;
  const prefillRegion =
    typeof router.query.headquarters_region === "string"
      ? router.query.headquarters_region
      : undefined;

  // Test mode: show thank you page directly with ?testThankYou=true
  const testThankYou = router.query.testThankYou === "true";

  const subtitle = companyName ? (
    <>
      We're excited to show you how Dust can help <strong>{companyName}</strong>
      . To prepare for our demo call, please share a bit about yourself and the
      challenges you're hoping to address.
    </>
  ) : (
    <>
      To prepare for our demo call, please share a bit about yourself and the
      challenges you're hoping to address with Dust.
    </>
  );

  return (
    <UTMPageWrapper>
        <PageMetadata
          title="Contact Dust: Schedule a Demo for AI Agents"
          description="Get in touch with the Dust team. Schedule a demo call to learn how AI agents can help address your team's challenges and improve productivity."
          pathname={router.asPath}
        />
        <div className="flex w-full flex-col justify-center gap-12">
          <HeaderContentBlock
            title="Contact Dust"
            hasCTA={false}
            subtitle={subtitle}
          />
          <Grid>
            <div className="col-span-12 sm:col-span-12 md:col-span-12 lg:col-span-8 lg:col-start-2 xl:col-span-8 xl:col-start-2 2xl:col-start-3">
              {testThankYou ? (
                <ContactFormThankYou
                  firstName="Alban"
                  lastName="Music"
                  email="alban@dust.tt"
                  phone="+33612345678"
                  language="I would like my meeting to be in English 🇬🇧🇺🇸"
                  headquartersRegion="Europe"
                  companyHeadcount="101-500"
                  howToUseDust="Testing the Default.com integration"
                  isQualified={true}
                />
              ) : (
                <ContactForm
                  prefillEmail={prefillEmail}
                  prefillHeadcount={prefillHeadcount}
                  prefillRegion={prefillRegion}
                />
              )}
            </div>
          </Grid>
          <TrustedBy />
        </div>
    </UTMPageWrapper>
  );
}

Contact.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
