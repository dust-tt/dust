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
    card: "bg-green-50",
    visual: "bg-green-100",
  },
  blue: {
    card: "bg-blue-50",
    visual: "bg-blue-100",
  },
  golden: {
    card: "bg-golden-50",
    visual: "bg-golden-100",
  },
  rose: {
    card: "bg-rose-50",
    visual: "bg-rose-100",
  },
};

const cardVariants = cva("", {
  variants: {
    color: {
      green: "bg-green-50",
      blue: "bg-blue-50",
      golden: "bg-golden-50",
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
    <div className="flex h-full flex-col overflow-hidden rounded-2xl">
      <div
        className={`h-60 w-full ${cardVariants({ color })} rounded-t-2xl px-4 pb-0 pt-4`}
      >
        <div
          className={`flex h-full w-full items-center justify-center rounded-xl ${colorVariants[color].visual} p-2`}
        >
          <img
            src={visualSrc}
            alt={`${title} visual`}
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      <div
        className={`flex flex-grow flex-col gap-2 rounded-b-2xl px-8 pb-8 pt-4 ${cardVariants({ color })}`}
      >
        <H3 className="text-gray-900" mono>
          {title}
        </H3>
        <ul className="copy-base flex-grow font-medium text-gray-700">
          {features.map((feature, i) => (
            <li
              key={i}
              className="flex min-h-6 items-start gap-1 py-1.5 text-gray-700"
            >
              <div className="pt-0.5">
                <Icon visual={ChevronRightIcon} size="sm" />
              </div>
              {feature}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Link href={href} shallow>
            <Button variant="outline" label="Learn more" size="sm" />
          </Link>
        </div>
      </div>
    </div>
  );
}
