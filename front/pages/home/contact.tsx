import dynamic from 'next/dynamic';
import type { ReactElement } from "react";
import React, { useState } from "react";
import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import TrustedBy from "@app/components/home/TrustedBy";

import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";

// Create a separate component for HubSpot form
const HubSpotForm = dynamic(
  () => 
    import('./HubSpotForm').then((mod) => mod.HubSpotForm),
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
    <div className="flex flex-col gap-12 w-full justify-center">
      <HeaderContentBlock
        title="Contact Dust"
        from="from-emerald-200"
        to="to-emerald-500"
        hasCTA={false}
        subtitle={
          <>
            To prepare for our demo call, please share a bit about yourself and the challenges you're hoping to address with Dust.
            <div className="flex w-full justify-left px-4 pt-12 sm:px-6 lg:px-8">
              <div className="w-full max-w-[600px] pb-4">
                <HubSpotForm />
              </div>
            </div>
          </>
        }
      />
      <TrustedBy />
    </div>
  );
}

Contact.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};