// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { ContactForm } from "@app/components/home/ContactForm";
import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import { Grid } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import TrustedBy from "@app/components/home/TrustedBy";
import { isString } from "@app/types/shared/utils/general";
import type { GetStaticProps } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      shape: 0,
    },
  };
};

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Contact() {
  const router = useRouter();
  const { company, email, company_headcount_form, headquarters_region } =
    router.query;

  const companyName = isString(company) ? company : null;
  const prefillEmail = isString(email) ? email : undefined;
  const prefillHeadcount = isString(company_headcount_form)
    ? company_headcount_form
    : undefined;
  const prefillRegion = isString(headquarters_region)
    ? headquarters_region
    : undefined;

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
    <>
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
            <ContactForm
              prefillEmail={prefillEmail}
              prefillHeadcount={prefillHeadcount}
              prefillRegion={prefillRegion}
            />
          </div>
        </Grid>
        <TrustedBy />
      </div>
    </>
  );
}

Contact.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
