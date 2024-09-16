import React from "react";

import { classNames } from "@app/lib/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@app/pages/site/components/Carousel";
import { Grid, H2 } from "@app/pages/site/components/ContentComponents";
import { CustomerCaroussel } from "@app/pages/site/solutions/customer-support";
import { DataCaroussel } from "@app/pages/site/solutions/data-analytics";
import { EngineeringCaroussel } from "@app/pages/site/solutions/engineering";
import { KnowledgeCaroussel } from "@app/pages/site/solutions/knowledge";
import { MarketingCaroussel } from "@app/pages/site/solutions/marketing";
import { RecruitingCaroussel } from "@app/pages/site/solutions/recruiting-people";
import { SalesCaroussel } from "@app/pages/site/solutions/sales";

export function VerticalSection() {
  return (
    <Grid gap="gap-8">
      <div
        className={classNames(
          "flex flex-col gap-8",
          "col-span-12",
          "lg:col-span-10 lg:col-start-2",
          "xl:col-span-9 xl:col-start-2",
          "2xl:col-start-3"
        )}
      >
        <H2 className="text-white">Dust for Marketing, Sales, Data,…</H2>
      </div>
      <div
        className={classNames(
          "flex flex-col items-center gap-4",
          "col-span-12",
          "xl:col-span-10 xl:col-start-2"
        )}
      >
        <Carousel className="w-full rounded-3xl" isLooping={true}>
          <div className="flex w-full flex-row gap-4">
            <CarouselPrevious label="previous" />
            <CarouselNext label="next" />
          </div>
          <CarouselContent className="rounded-xl">
            <CarouselItem className="basis-full">
              <CustomerCaroussel />
            </CarouselItem>
            <CarouselItem className="basis-full">
              <MarketingCaroussel />
            </CarouselItem>
            <CarouselItem className="basis-full">
              <RecruitingCaroussel />
            </CarouselItem>
            <CarouselItem className="basis-full">
              <EngineeringCaroussel />
            </CarouselItem>
            <CarouselItem className="basis-full">
              <KnowledgeCaroussel />
            </CarouselItem>
            <CarouselItem className="basis-full">
              <DataCaroussel />
            </CarouselItem>
            <CarouselItem className="basis-full">
              <SalesCaroussel />
            </CarouselItem>
          </CarouselContent>
        </Carousel>
      </div>
    </Grid>
  );
}
