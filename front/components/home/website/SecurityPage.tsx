import React from "react";

import { Grid, H2, P, Strong } from "@app/components/home/contentComponents";

export function SecurityPage() {
  return (
    <>
      {/* Design for security */}
      <Grid>
        <div
          // ref={scrollRef3}
          className="col-span-12 md:col-span-6 md:row-span-2 xl:col-span-5 xl:col-start-2"
        >
          <H2 className="text-red-400">
            Designed for security
            <br />
            <span className="text-red-200">and data privacy.</span>
          </H2>
        </div>
        <P size="lg" className="col-span-6 xl:col-span-5 2xl:col-span-4">
          <Strong>Your data is private</Strong>, No re-training of&nbsp;models
          on your internal knowledge.
        </P>
        <P size="lg" className="col-span-6 xl:col-span-5 2xl:col-span-4">
          <Strong>Enterprise-grade security</Strong> to manage your&nbsp;data
          access policies with control and&nbsp;confidence.
        </P>
      </Grid>
    </>
  );
}
