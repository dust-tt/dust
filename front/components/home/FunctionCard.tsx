import { Button, ChevronRightIcon, Icon } from "@dust-tt/sparkle";
import { cva } from "class-variance-authority";
import Link from "next/link";
import React from "react";

import { H3, P } from "@app/components/home/ContentComponents";

interface FunctionCardProps {
  title: string;
  features: string[];
  color: "green" | "blue" | "rose" | "yellow";
  visualSrc: string;
  href: string;
}

const colorVariants = {
  green: {
    card: "bg-green-100",
    visual: "bg-green-100",
  },
  blue: {
    card: "bg-blue-600",
    visual: "bg-blue-100",
  },
  rose: {
    card: "bg-purple-600",
    visual: "bg-rose-100",
  },
  yellow: {
    card: "bg-yellow-600",
    visual: "bg-yellow-100",
  },
};

const cardVariants = cva("", {
  variants: {
    color: {
      green: "bg-brand-support-green",
      blue: "bg-brand-support-blue",
      rose: "bg-brand-support-rose",
      yellow: "bg-brand-support-yellow",
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
        <H3 className="text-grey-900" mono>
          {title}
        </H3>
        <P size="sm" className="flex-grow font-medium text-gray-700">
          <ul>
            {features.map((feature, i) => (
              <li key={i} className="flex min-h-6 items-start gap-1 py-1.5">
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
