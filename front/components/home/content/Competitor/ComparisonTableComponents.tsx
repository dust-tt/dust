import Image from "next/image";

import { cn } from "@app/components/poke/shadcn/lib/utils";

interface ComparisonTableHeaderProps {
  competitorName: string;
  competitorLogo?: string;
}

export function ComparisonTableHeader({
  competitorName,
  competitorLogo,
}: ComparisonTableHeaderProps) {
  return (
    <div className="hidden grid-cols-3 md:grid">
      <div className="px-6 py-4" />
      <div className="flex items-center justify-center rounded-tl-2xl border-l border-t border-border bg-green-500 px-4 py-4">
        <Image
          src="/static/landing/logos/dust/Dust_Logo_White.svg"
          alt="Dust"
          width={60}
          height={20}
          className="h-5 w-auto"
        />
      </div>
      <div className="flex items-center justify-center rounded-tr-2xl border-l border-r border-t border-border bg-white px-4 py-4">
        {competitorLogo ? (
          <Image
            src={competitorLogo}
            alt={competitorName}
            width={80}
            height={24}
            className="h-5 w-auto"
          />
        ) : (
          <span className="text-sm font-semibold text-foreground">
            {competitorName}
          </span>
        )}
      </div>
    </div>
  );
}

export const COMPARISON_TABLE_CONTAINER_CLASSES =
  "mx-auto max-w-4xl overflow-hidden rounded-2xl bg-white";

interface CellPositionProps {
  isFirst: boolean;
  isLast: boolean;
}

export function getFirstColumnClasses(
  { isFirst, isLast }: CellPositionProps,
  baseClasses: string = ""
) {
  return cn(
    "border-b border-l border-border px-6 py-4",
    isFirst && "rounded-tl-2xl border-t",
    isLast && "rounded-bl-2xl",
    baseClasses
  );
}

export function getMiddleColumnClasses(
  { isFirst }: Pick<CellPositionProps, "isFirst">,
  baseClasses: string = ""
) {
  return cn(
    "border-b border-l border-border px-4 py-4",
    isFirst && "border-t",
    baseClasses
  );
}

export function getLastColumnClasses(
  { isFirst, isLast }: CellPositionProps,
  baseClasses: string = ""
) {
  return cn(
    "border-b border-l border-r border-border px-4 py-4",
    isFirst && "border-t",
    isLast && "rounded-br-2xl",
    baseClasses
  );
}
