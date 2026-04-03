import { Grid, H2, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import { PartnerForm } from "@app/components/home/PartnerForm";
import {
  PartnerHero,
  PartnerIdealPartners,
  PartnerSocialProof,
} from "@app/components/home/PartnerHero";
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
export default function Partner() {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title="Become a Dust Partner: Join Our Partner Network"
        description="Partner with Dust to help businesses deploy AI agents. Join our network of resellers, implementation partners, and technology partners."
        pathname={router.asPath}
      />
      <div className="flex w-full flex-col justify-center gap-12">
        <PartnerHero />
        <Grid>
          <div className="col-span-12 sm:col-span-12 md:col-span-12 lg:col-span-8 lg:col-start-2 xl:col-span-8 xl:col-start-2 2xl:col-start-3">
            <div className="flex flex-col gap-4 pb-8">
              <H2>Join the Partner Waitlist</H2>
              <P size="md" className="text-muted-foreground">
                Partners are central to our next stage at Dust. Together with
                agencies, system integrators, consultants, and creators,
                we&apos;ll accelerate how companies adopt AI and transform how
                work gets done. Join the waitlist and we&apos;ll reach out as
                soon as we&apos;re ready to explore a partnership with you.
              </P>
            </div>
            <PartnerForm />
          </div>
        </Grid>
        <PartnerSocialProof />
        <PartnerIdealPartners />
      </div>
    </>
  );
}

Partner.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
