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
        <div className="mb-6 flex items-end justify-between">
          <div className="w-full max-w-5xl">{title}</div>
          <div className="flex gap-4">
            <CarouselPrevious />
            <CarouselNext />
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
