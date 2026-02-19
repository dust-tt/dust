// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { H2 } from "@app/components/home/ContentComponents";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import { CheckIcon, Icon, XMarkIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import type { ReactNode } from "react";

type FeatureStatus = "yes" | "no" | "partial";

interface ComparisonFeature {
  name: string;
  description?: string;
  dust: FeatureStatus;
  competitor: FeatureStatus;
}

interface ComparisonTableSectionProps {
  title?: string;
  dustHeader: string;
  competitorHeader: string;
  competitorLogo?: string;
  features: ComparisonFeature[];
}

const STATUS_CONFIG: Record<FeatureStatus, { bg: string; content: ReactNode }> =
  {
    yes: {
      bg: "bg-emerald-100",
      content: (
        <Icon
          visual={CheckIcon}
          className="h-4 w-4 text-emerald-600"
          size="sm"
        />
      ),
    },
    no: {
      bg: "bg-red-100",
      content: <Icon visual={XMarkIcon} className="h-4 w-4 text-red-500" />,
    },
    partial: {
      bg: "bg-amber-100",
      content: <span className="text-sm font-bold text-amber-600">~</span>,
    },
  };

interface StatusIconProps {
  status: FeatureStatus;
}

function StatusIcon({ status }: StatusIconProps) {
  const config = STATUS_CONFIG[status];
  return (
    <div
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full",
        config.bg
      )}
    >
      {config.content}
    </div>
  );
}

export function ComparisonTableSection({
  title = "How Dust Compares to Glean",
  dustHeader,
  competitorHeader,
  competitorLogo,
  features,
}: ComparisonTableSectionProps) {
  return (
    <section className="w-full">
      <H2 className="mb-8 text-center">{title}</H2>

      <div className="mx-auto max-w-4xl">
        {/* Header - outside the table border */}
        <div className="grid grid-cols-[1fr,80px,80px] sm:grid-cols-[1fr,120px,120px] md:grid-cols-[1fr,140px,140px]">
          <div />
          <div className="flex items-center justify-center rounded-tl-xl bg-gradient-to-b from-blue-500 to-blue-600 p-4">
            <Image
              src="/static/landing/logos/dust/Dust_Logo_White.svg"
              alt={dustHeader}
              width={80}
              height={24}
              unoptimized
            />
          </div>
          <div className="flex items-center justify-center rounded-tr-xl bg-gray-100 p-4">
            {competitorLogo ? (
              <Image
                src={competitorLogo}
                alt={competitorHeader}
                width={80}
                height={20}
                unoptimized
              />
            ) : (
              <span className="text-sm font-medium lowercase tracking-wider text-gray-500">
                {competitorHeader}
              </span>
            )}
          </div>
        </div>

        {/* Features - with border */}
        <div className="overflow-hidden rounded-b-2xl rounded-tl-2xl border border-gray-200 bg-white shadow-md">
          {features.map((feature, index) => (
            <div
              key={feature.name}
              className={cn(
                "grid grid-cols-[1fr,80px,80px] sm:grid-cols-[1fr,120px,120px] md:grid-cols-[1fr,140px,140px]",
                index !== features.length - 1 && "border-b border-gray-100"
              )}
            >
              <div className="flex flex-col justify-center p-4">
                <span className="text-sm font-semibold text-gray-900">
                  {feature.name}
                </span>
                {feature.description && (
                  <span className="mt-0.5 hidden text-xs text-gray-500 sm:block">
                    {feature.description}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-center border-l border-gray-100 bg-blue-50/50 p-4">
                <StatusIcon status={feature.dust} />
              </div>
              <div className="flex items-center justify-center border-l border-gray-100 p-4">
                <StatusIcon status={feature.competitor} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
