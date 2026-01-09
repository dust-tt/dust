import { Grid } from "@app/components/home/ContentComponents";
import { FAQ } from "@app/components/home/FAQ";

import type { FAQSectionConfig } from "./types";

interface FAQSectionProps {
  config: FAQSectionConfig;
}

export function FAQSection({ config }: FAQSectionProps) {
  return (
    <div className="py-12 md:py-16">
      <Grid>
        <div className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3">
          <FAQ title={config.title} items={config.items} />
        </div>
      </Grid>
    </div>
  );
}
