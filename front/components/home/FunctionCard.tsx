import { Button, ChevronRightIcon, Icon } from "@dust-tt/sparkle";
import { cva } from "class-variance-authority";
import Link from "next/link";
import React from "react";

import { H3 } from "@app/components/home/ContentComponents";

interface FunctionCardProps {
  title: string;
  features: string[];
  color: "green" | "blue" | "golden" | "rose";
  visualSrc: string;
  href: string;
}

const colorVariants = {
  green: {
    card: "bg-brand-hunter-green",
    visual: "bg-green-50",
    inner: "bg-green-100",
  },
  blue: {
    card: "bg-brand-electric-blue",
    visual: "bg-blue-50",
    inner: "bg-blue-100",
  },
  golden: {
    card: "bg-brand-orange-golden",
    visual: "bg-amber-50",
    inner: "bg-amber-100",
  },
  rose: {
    card: "bg-brand-red-rose",
    visual: "bg-rose-50",
    inner: "bg-rose-100",
  },
};

const cardVariants = cva("", {
  variants: {
    color: {
      green: "bg-green-50",
      blue: "bg-blue-50",
      golden: "bg-amber-50",
      rose: "bg-rose-50",
    },
  },
});

export function FunctionCard({
  title,
  features,
  color,
  visualSrc,
  href,
}: FunctionCardProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl font-sans">
      <div
        className={`h-60 w-full ${colorVariants[color].visual} rounded-t-2xl p-4`}
      >
        <div className="flex h-full w-full items-center justify-center">
          <div
            className={`${colorVariants[color].inner} flex h-full w-full items-center justify-center rounded-lg p-4`}
          >
            <img
              src={visualSrc}
              alt={`${title} visual`}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>
      </div>

      <div
        className={`flex flex-grow flex-col gap-2 px-6 pb-6 ${cardVariants({ color })}`}
      >
        <H3 className="font-medium text-black" mono>
          {title}
        </H3>
        <ul className="flex-grow font-sans font-medium text-black/80">
          {features.map((feature, i) => (
            <li
              key={i}
              className="flex min-h-6 items-start gap-1 py-1.5 text-base font-medium text-black/80"
            >
              <div className="pt-0.5">
                <Icon visual={ChevronRightIcon} size="sm" />
              </div>
              {feature}
            </li>
          ))}
        </ul>
        <div>
          <Link href={href} shallow>
            <Button variant="outline" label="Learn more" size="sm" />
          </Link>
        </div>
      </div>
    </div>
  );
}
