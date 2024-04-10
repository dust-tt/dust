import React from "react";

import {
  Grid,
  H2,
  P,
  Strong,
} from "@app/components/home/new/ContentComponents";

export function SecurityPage() {
  return (
    <>
      {/* Design for security */}
      <Grid>
        <H2
          className="col-span-8 col-start-2"
          from="from-sky-300"
          to="to-sky-500"
        >
          Designed for security
          <br />
          and data privacy.
        </H2>
        <P size="lg" className="col-span-5 col-start-2">
          <Strong>Your data is private</Strong>, No re-training of&nbsp;models
          on your internal knowledge.
        </P>
        <P size="lg" className="col-span-5">
          <Strong>Enterprise-grade security</Strong> to manage your&nbsp;data
          access policies with control and&nbsp;confidence.
        </P>
      </Grid>
    </>
  );
}
