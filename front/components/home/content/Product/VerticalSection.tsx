import React from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@app/components/home/Carousel";
import { H2 } from "@app/components/home/ContentComponents";
import { CustomerCaroussel } from "@app/pages/home/solutions/customer-support";
import { DataCaroussel } from "@app/pages/home/solutions/data-analytics";
import { EngineeringCaroussel } from "@app/pages/home/solutions/engineering";
import { KnowledgeCaroussel } from "@app/pages/home/solutions/knowledge";
import { MarketingCaroussel } from "@app/pages/home/solutions/marketing";
import { RecruitingCaroussel } from "@app/pages/home/solutions/recruiting-people";
import { SalesCaroussel } from "@app/pages/home/solutions/sales";

export function VerticalSection() {
  return (
    <div className="w-full">
      <Carousel className="w-full rounded-3xl" isLooping={true}>
        <div className="mb-6 flex items-center justify-between">
          <H2 className="text-white">Dust for Marketing, Sales, Data,…</H2>
          <div className="flex space-x-2">
            <CarouselPrevious />
            <CarouselNext />
          </div>
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
  );
}
