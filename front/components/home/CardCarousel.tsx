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
    <div className="w-full">
      <Carousel className="w-full">
        <div className="mb-6 flex items-end justify-between">
          <div className="w-full max-w-5xl">{title}</div>
          <div className="flex gap-4">
            <CarouselPrevious />
            <CarouselNext />
          </div>
        </div>

        <CarouselContent className="-ml-2 -mr-2">
          {React.Children.map(children, (child, index) => (
            <CarouselItem key={index} className="sm:basis-1/2 lg:basis-1/3">
              {child}
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}

export { CardCarousel };
