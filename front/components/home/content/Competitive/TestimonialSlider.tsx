// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { ChevronLeftIcon, ChevronRightIcon, cn } from "@dust-tt/sparkle";
import Image from "next/image";
import { useState } from "react";

export interface HeroTestimonial {
  quote: string;
  company: string;
  author: string;
  image: string;
}

interface TestimonialSliderProps {
  testimonials: HeroTestimonial[];
}

export function TestimonialSlider({ testimonials }: TestimonialSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const next = () =>
    setCurrentIndex((current) => (current + 1) % testimonials.length);
  const prev = () =>
    setCurrentIndex(
      (current) => (current - 1 + testimonials.length) % testimonials.length
    );

  return (
    <div className="mx-auto w-full max-w-4xl">
      <p className="mb-8 text-xl font-medium italic leading-relaxed tracking-tight text-gray-600 md:text-[22px]">
        &ldquo;{testimonials[currentIndex].quote}&rdquo;
      </p>

      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <Image
            src={testimonials[currentIndex].image}
            alt={testimonials[currentIndex].author}
            width={56}
            height={56}
            className="h-14 w-14 rounded-full border border-gray-100 bg-gray-200 object-cover"
            unoptimized
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-[#111418]">
              {testimonials[currentIndex].company}
            </span>
            <span className="text-base text-gray-500">
              {testimonials[currentIndex].author}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex gap-2">
            {testimonials.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  idx === currentIndex ? "w-6 bg-[#1C91FF]" : "w-2 bg-gray-200"
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={prev}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50"
              aria-label="Previous testimonial"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              onClick={next}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50"
              aria-label="Next testimonial"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
