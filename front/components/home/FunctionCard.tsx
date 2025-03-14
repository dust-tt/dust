import { Button, ChevronRightIcon } from "@dust-tt/sparkle";
import { cva } from "class-variance-authority";
import Link from "next/link";
import React from "react";

interface FunctionCardProps {
  title: string;
  features: string[];
  color: "green" | "blue" | "purple";
  visualSrc: string;
  href: string;
}

const colorVariants = {
  green: {
    card: "bg-green-600",
    visual: "bg-green-100",
  },
  blue: {
    card: "bg-blue-600",
    visual: "bg-blue-100",
  },
  purple: {
    card: "bg-purple-600",
    visual: "bg-purple-100",
  },
};

const cardVariants = cva("", {
  variants: {
    color: {
      green: "bg-green-600",
      blue: "bg-blue-600",
      purple: "bg-purple-600",
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
    <div className="flex h-full flex-col overflow-hidden rounded-3xl">
      <div className={`h-60 w-full px-4 py-4 ${colorVariants[color].visual}`}>
        <div className="flex h-full w-full items-center justify-center">
          <img
            src={visualSrc}
            alt={`${title} visual`}
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      <div className={`flex flex-grow flex-col p-5 ${cardVariants({ color })}`}>
        <h3 className="font-objektiv text-2xl font-semibold text-white">
          {title}
        </h3>

        <ul className="mt-4 flex-grow space-y-3 font-objektiv">
          {features.map((feature, i) => (
            <li key={i} className="flex min-h-6 items-start gap-3 text-white">
              <ChevronRightIcon className="mt-1 h-4 w-4 flex-shrink-0" />
              <span className="text-base leading-tight">{feature}</span>
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
