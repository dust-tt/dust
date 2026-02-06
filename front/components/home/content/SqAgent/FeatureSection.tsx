import { CheckIcon, cn, Icon } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

import { H2, P } from "@app/components/home/ContentComponents";

const BULLET_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-600" },
  { bg: "bg-pink-100", text: "text-pink-600" },
  { bg: "bg-emerald-100", text: "text-emerald-600" },
  { bg: "bg-purple-100", text: "text-purple-600" },
];

interface FeatureSectionProps {
  title: string;
  titleHighlight: string;
  description: string;
  features: string[];
  image: {
    src: string;
    alt: string;
  };
  imagePosition: "left" | "right";
  backgroundColor?: string;
  colorIndex?: number;
  visualComponent?: ReactNode;
}

export function FeatureSection({
  title,
  titleHighlight,
  description,
  features,
  image,
  imagePosition,
  backgroundColor,
  colorIndex = 0,
  visualComponent,
}: FeatureSectionProps) {
  const colors = BULLET_COLORS[colorIndex % BULLET_COLORS.length];

  const contentSection = (
    <div className="flex flex-col justify-center lg:w-1/2">
      <H2 className="mb-4">
        {title}{" "}
        <span className="bg-gradient-to-r from-blue-500 to-emerald-500 bg-clip-text text-transparent">
          {titleHighlight}
        </span>
      </H2>
      <P size="md" className="mb-6 text-muted-foreground">
        {description}
      </P>
      <ul className="space-y-3">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full",
                colors.bg
              )}
            >
              <Icon visual={CheckIcon} className={cn("h-3 w-3", colors.text)} />
            </span>
            <span className="text-foreground">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  const imageSection = (
    <div className="flex items-center justify-center lg:w-1/2">
      {visualComponent ?? (
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 shadow-lg">
          {/* Placeholder for actual image - can be replaced with actual screenshots */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-500" />
              <span className="text-sm text-muted-foreground">{image.alt}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section
      className={cn(
        "w-full",
        backgroundColor ? "-mx-6 px-6 py-16 md:-mx-8 md:px-8" : "py-8"
      )}
      style={
        backgroundColor
          ? {
              marginLeft: "calc(-50vw + 50%)",
              width: "100vw",
              paddingLeft: "max(1.5rem, calc(50vw - 50% + 1.5rem))",
              paddingRight: "max(1.5rem, calc(50vw - 50% + 1.5rem))",
            }
          : undefined
      }
    >
      <div
        className={cn(
          backgroundColor ?? "",
          backgroundColor ? "rounded-none py-16" : ""
        )}
      >
        <div
          className={cn(
            "mx-auto flex max-w-6xl flex-col gap-8 lg:flex-row lg:gap-16",
            imagePosition === "left" ? "lg:flex-row-reverse" : ""
          )}
        >
          {contentSection}
          {imageSection}
        </div>
      </div>
    </section>
  );
}
