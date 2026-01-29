import { Button } from "@dust-tt/sparkle";
import Link from "next/link";

import { H2 } from "@app/components/home/ContentComponents";

interface FinalCTASectionConfig {
  title: string;
  subtitle: string;
  primaryCTA: {
    label: string;
    href: string;
  };
  secondaryCTA?: {
    label: string;
    href: string;
  };
  trustText?: string;
}

interface FinalCTASectionProps {
  config: FinalCTASectionConfig;
}

export function FinalCTASection({ config }: FinalCTASectionProps) {
  return (
    <section className="bg-muted py-20 dark:bg-muted-night">
      <div className="container px-4">
        <div className="mx-auto max-w-3xl text-center">
          <H2 className="mb-4 text-foreground dark:text-foreground-night">
            {config.title}
          </H2>
          <p className="mb-8 text-lg text-muted-foreground dark:text-muted-foreground-night">
            {config.subtitle}
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href={config.primaryCTA.href}>
              <Button label={config.primaryCTA.label} variant="primary" />
            </Link>
            {config.secondaryCTA && (
              <Link href={config.secondaryCTA.href}>
                <Button label={config.secondaryCTA.label} variant="outline" />
              </Link>
            )}
          </div>
          {config.trustText && (
            <p className="mt-6 text-sm text-muted-foreground dark:text-muted-foreground-night">
              {config.trustText}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
