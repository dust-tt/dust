import type { ReactNode } from "react";
import React from "react";

import { Grid, H2, H3, P } from "@app/components/home/contentComponents";
import { classNames } from "@app/lib/utils";

interface HeaderContentBlockProps {
  title: ReactNode;
  subtitle: ReactNode;
  uptitle: string;
}

export const HeaderContentBlock = ({
  title,
  subtitle,
  uptitle,
}: HeaderContentBlockProps) => (
  <Grid>
    <div
      className={classNames(
        "flex min-h-[50vh] flex-col justify-end gap-8",
        "col-span-12",
        "lg:col-span-10 lg:col-start-2",
        "xl:col-span-9 xl:col-start-2",
        "2xl:col-start-3"
      )}
    >
      <P size="lg">{uptitle}</P>
      <div className="h-4" />
      <H2>{title}</H2>
      <H3 className="text-white">{subtitle}</H3>
    </div>
  </Grid>
);
