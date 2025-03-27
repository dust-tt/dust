import { Button, ChevronRightIcon, Icon } from "@dust-tt/sparkle";
import { cva } from "class-variance-authority";
import Link from "next/link";
import React from "react";

import { H3, P } from "@app/components/home/ContentComponents";

interface FunctionCardProps {
  title: string;
  features: string[];
  color: "green" | "blue" | "purple" | "golden" | "rose";
  visualSrc: string;
  href: string;
}

const colorVariants = {
  green: {
    card: "bg-brand-hunter-green",
    visual: "bg-brand-tea-green",
  },
  blue: {
    card: "bg-brand-electric-blue",
    visual: "bg-brand-sky-blue",
  },
  golden: {
    card: "bg-brand-orange-golden",
    visual: "bg-brand-sunshine-golden",
  },
  rose: {
    card: "bg-brand-red-rose",
    visual: "bg-brand-pink-rose",
  },
  purple: {
    card: "bg-brand-red-rose",
    visual: "bg-brand-pink-rose",
  },
};

const cardVariants = cva("", {
  variants: {
    color: {
      green: "bg-brand-hunter-green",
      blue: "bg-brand-electric-blue",
      golden: "bg-brand-orange-golden",
      rose: "bg-brand-red-rose",
      purple: "bg-brand-red-rose",
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
    <div className="flex h-full flex-col overflow-hidden">
      <div className={`h-60 w-full px-4 ${colorVariants[color].visual}`}>
        <div className="flex h-full w-full items-center justify-center">
          <img
            src={visualSrc}
            alt={`${title} visual`}
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      <div
        className={`flex flex-grow flex-col gap-2 p-8 ${cardVariants({ color })}`}
      >
        <H3 className="text-white" mono>
          {title}
        </H3>
        <P size="sm" className="flex-grow font-medium text-white/80">
          <ul>
            {features.map((feature, i) => (
              <li
                key={i}
                className="flex min-h-6 items-start gap-1 py-1.5 text-white/80"
              >
                <div className="pt-0.5">
                  <Icon visual={ChevronRightIcon} size="sm" />
                </div>
                {feature}
              </li>
            ))}
          </ul>
        </P>
        <div className="mt-4">
          <Link href={href} shallow>
            <Button variant="outline" label="Learn more" size="sm" />
          </Link>
        </div>
      </div>
    </div>
  );
}
