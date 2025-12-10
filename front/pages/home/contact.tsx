import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import HubSpotForm from "@app/components/home/HubSpotForm";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import TrustedBy from "@app/components/home/TrustedBy";
import UTMPageWrapper from "@app/components/UTMPageWrapper";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function Contact() {
  const router = useRouter();
  const companyName =
    typeof router.query.company === "string" ? router.query.company : null;

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
        <div className="grid grid-cols-12 items-start sm:gap-8 md:gap-y-12">
          <div className="col-span-12 flex flex-col justify-end gap-12 sm:col-span-12 lg:col-span-8 lg:col-start-2 xl:col-span-8 xl:col-start-2 2xl:col-start-3">
            <div className="w-full max-w-150">
              <HubSpotForm />
            </div>
          </div>
        </div>
        <TrustedBy />
      </div>
    </UTMPageWrapper>
  );
}

Contact.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
