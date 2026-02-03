import { CheckIcon, Icon, XMarkIcon } from "@dust-tt/sparkle";
import Image from "next/image";

import { H2 } from "@app/components/home/ContentComponents";
import { cn } from "@app/components/poke/shadcn/lib/utils";

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

function StatusIcon({ status }: { status: FeatureStatus }) {
  if (status === "yes") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
        <Icon
          visual={CheckIcon}
          className="h-4 w-4 text-emerald-600"
          size="sm"
        />
      </div>
    );
  }
  if (status === "no") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100">
        <Icon visual={XMarkIcon} className="h-4 w-4 text-red-500" />
      </div>
    );
  }
  // partial
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100">
      <span className="text-sm font-bold text-amber-600">~</span>
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
        <div className="grid grid-cols-[1fr,120px,120px] md:grid-cols-[1fr,140px,140px]">
          <div />
          <div className="flex items-center justify-center rounded-tl-xl bg-gradient-to-b from-blue-500 to-blue-600 p-4">
            <Image
              src="/static/landing/logos/dust/Dust_Logo_White.svg"
              alt={dustHeader}
              width={80}
              height={24}
              className="h-6 w-auto"
            />
          </div>
          <div className="flex items-center justify-center rounded-tr-xl bg-gray-100 p-4">
            {competitorLogo ? (
              <Image
                src={competitorLogo}
                alt={competitorHeader}
                width={80}
                height={24}
                className="h-5 w-auto"
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
                "grid grid-cols-[1fr,120px,120px] md:grid-cols-[1fr,140px,140px]",
                index !== features.length - 1 && "border-b border-gray-100"
              )}
            >
              <div className="flex flex-col justify-center p-4">
                <span className="text-sm font-semibold text-gray-900">
                  {feature.name}
                </span>
                {feature.description && (
                  <span className="mt-0.5 text-xs text-gray-500">
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
