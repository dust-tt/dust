import type { ParsedUrlQuery } from "querystring";
import React from "react";

import { BlogSection } from "@app/components/home/content/Product/BlogSection";
import { FutureSection } from "@app/components/home/content/Product/FutureSection";
import { IntroSection } from "@app/components/home/content/Product/IntroSection";
import { TeamSection } from "@app/components/home/content/Product/TeamSection";

interface ProductPageProps {
  getReturnToUrl: (routerQuery: ParsedUrlQuery) => string;
}

export function ProductPage({ getReturnToUrl }: ProductPageProps) {
  return (
    <>
      <IntroSection getReturnToUrl={getReturnToUrl} />
      <TeamSection />
      <FutureSection />
      <BlogSection />
    </>
  );
}
