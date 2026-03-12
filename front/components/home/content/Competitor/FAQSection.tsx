import { FAQ } from "@app/components/home/FAQ";

import type { FAQSectionConfig } from "./types";

interface FAQSectionProps {
  config: FAQSectionConfig;
}

export function FAQSection({ config }: FAQSectionProps) {
  return (
    <div className="py-12 md:py-16">
      <div className="mx-auto max-w-4xl">
        <FAQ title={config.title} items={config.items} />
      </div>
    </div>
  );
}
