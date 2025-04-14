import React from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./Carousel";

interface CardCarouselProps {
  title: React.ReactNode;
  children: React.ReactNode;
}

function CardCarousel({ title, children }: CardCarouselProps) {
  return (
    <div className="w-full rounded-xl">
      <Carousel className="w-full rounded-xl" opts={{ align: "start" }}>
        <div className="mb-4 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 text-lg font-semibold sm:text-xl">{title}</div>
          <div className="flex items-center gap-2 sm:gap-4">
            <CarouselPrevious className="h-8 w-8 sm:h-10 sm:w-10" />
            <CarouselNext className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
        </div>

        <CarouselContent className="-ml-4 rounded-xl">
          {React.Children.map(children, (child, index) => (
            <CarouselItem
              key={index}
              className="rounded-xl pl-4 pr-4 sm:basis-1/2 lg:basis-1/3"
            >
              {child}
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}

export { CardCarousel };
