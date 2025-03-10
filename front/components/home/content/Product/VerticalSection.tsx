import { Button } from "@dust-tt/sparkle";
import React from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@app/components/home/Carousel";
import { H2, P } from "@app/components/home/ContentComponents";
import { CustomerCaroussel } from "@app/pages/home/solutions/customer-support";
import { DataCaroussel } from "@app/pages/home/solutions/data-analytics";
import { EngineeringCaroussel } from "@app/pages/home/solutions/engineering";
import { ITCaroussel } from "@app/pages/home/solutions/it";
import { KnowledgeCaroussel } from "@app/pages/home/solutions/knowledge";
import { LegalCaroussel } from "@app/pages/home/solutions/legal";
import { MarketingCaroussel } from "@app/pages/home/solutions/marketing";
import { ProductivityCaroussel } from "@app/pages/home/solutions/productivity";
import { PeopleCaroussel } from "@app/pages/home/solutions/recruiting-people";
import { SalesCaroussel } from "@app/pages/home/solutions/sales";

export function VerticalSection() {
  const carouselSections = [
    { title: "Sales", component: SalesCaroussel },
    { title: "Customer Support", component: CustomerCaroussel },
    { title: "Marketing", component: MarketingCaroussel },
    { title: "Engineering", component: EngineeringCaroussel },
    { title: "Data Analytics", component: DataCaroussel },
    { title: "Knowledge", component: KnowledgeCaroussel },
    { title: "IT", component: ITCaroussel },
    { title: "Legal", component: LegalCaroussel },
    { title: "People", component: PeopleCaroussel },
    { title: "Productivity", component: ProductivityCaroussel },
  ];

  const [api, setApi] = React.useState<any>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);

  // Update active index when carousel moves
  React.useEffect(() => {
    if (!api) {
      return;
    }

    const onSelect = () => {
      setActiveIndex(api.selectedScrollSnap());
    };

    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  const handleButtonClick = React.useCallback(
    (index: number) => {
      if (api) {
        api.scrollTo(index);
      }
    },
    [api]
  );

  return (
    <div className="w-full">
      <Carousel className="w-full" isLooping={true} setApi={setApi}>
        <div>
          <H2 className="mb-4 text-brand-sky-blue">
            Custom AI agents for every function
          </H2>
          <P>
            Whether you’re a developer, marketer, or data scientist, Dust helps
            you perform sophisticated tasks, automate processes and extract
            powerful insights faster than ever before.
          </P>
          <div className="mt-6 flex flex-wrap gap-2">
            {carouselSections.map((section, index) => (
              <Button
                key={index}
                variant={activeIndex === index ? "primary" : "outline"}
                size="sm"
                label={section.title}
                onClick={() => handleButtonClick(index)}
              />
            ))}
          </div>
        </div>
        <CarouselContent className="rounded-xl">
          {carouselSections.map(({ component: Component }, index) => (
            <CarouselItem key={index}>
              <Component />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
