import dynamic from "next/dynamic";
import type { ReactElement } from "react";

import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import TrustedBy from "@app/components/home/TrustedBy";

const HubSpotForm = dynamic(
  () => import("./HubSpotForm").then((mod) => mod.HubSpotForm),
  { ssr: false }
);

export async function getServerSideProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.bigSphere),
    },
  };
}

export default function Contact() {
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
          <div className="max-w-150 w-full">
            <HubSpotForm />
          </div>
        </div>
      </div>
      <TrustedBy />
    </div>
  );
}

Contact.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
