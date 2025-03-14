import { Button, ChevronRightIcon } from "@dust-tt/sparkle";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import Link from "next/link";
import React from "react";

const cardVariants = cva("", {
  variants: {
    color: {
      green: "",
      blue: "",
      purple: "",
    },
    type: {
      visual: "h-60 w-full px-4 py-4",
      card: "flex flex-grow flex-col p-5",
    },
  },
  compoundVariants: [
    { color: "green", type: "visual", class: "bg-green-100" },
    { color: "green", type: "card", class: "bg-green-600" },
    { color: "blue", type: "visual", class: "bg-blue-100" },
    { color: "blue", type: "card", class: "bg-blue-600" },
    { color: "purple", type: "visual", class: "bg-purple-100" },
    { color: "purple", type: "card", class: "bg-purple-600" },
  ],
});

interface FunctionCardProps {
  title: string;
  features: string[];
  color: NonNullable<VariantProps<typeof cardVariants>["color"]>;
  visualSrc: string;
  href: string;
}

export function FunctionCard({
  title,
  features,
  color,
  visualSrc,
  href,
}: FunctionCardProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl">
      <div className={cardVariants({ color, type: "visual" })}>
        <div className="flex h-full w-full items-center justify-center">
          <img
            src={visualSrc}
            alt={`${title} visual`}
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      <div className={cardVariants({ color, type: "card" })}>
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
