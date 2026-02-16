// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { Grid } from "@app/components/home/ContentComponents";
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
