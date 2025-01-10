import { HubspotProvider } from "@aaronhayes/react-use-hubspot-form";
import type { ReactElement } from "react";

import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import TrustedBy from "@app/components/home/TrustedBy";
import { HubSpotForm } from "@app/pages/home/contact/hubspot/HubSpotForm";

export async function getServerSideProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.bigSphere),
    },
  };
}
function ContactContent() {
  return (
    <div className="flex w-full flex-col justify-center gap-12">
      <HeaderContentBlock
        title="Contact Dust"
        from="from-emerald-200"
        to="to-emerald-500"
        hasCTA={false}
        subtitle={
          <>
            To prepare for our demo call, please share a bit about yourself and
            the challenges you're hoping to address with Dust.
          </>
        }
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
  );
}

export default function Index() {
  return (
    <HubspotProvider>
      <ContactContent />
    </HubspotProvider>
  );
}

Index.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
