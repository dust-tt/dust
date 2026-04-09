import { H2, H3, H4, P } from "@app/components/home/ContentComponents";
import { cn } from "@dust-tt/sparkle";

interface PricingRow {
  product: string;
  price: string;
  includes: string;
  caveat: string;
}

interface GleanPricingSectionProps {
  title: string;
  subtitle: string;
  gleanDescription: string;
  rows: PricingRow[];
}

export function GleanPricingSection({
  title,
  subtitle,
  gleanDescription,
  rows,
}: GleanPricingSectionProps) {
  return (
    <section className="w-full py-3 md:py-6">
      <div className="mb-12 text-center">
        <H2 className="mb-4 text-center">{title}</H2>
        <P size="md" className="mx-auto mb-6 max-w-3xl text-muted-foreground">
          {subtitle}
        </P>
      </div>

      {/* Glean pricing callout */}
      <div className="mx-auto mb-10 max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 p-6 md:p-8">
        <H3 className="mb-3">What does Glean actually cost?</H3>
        <P size="sm" className="text-gray-700">
          {gleanDescription}
        </P>
      </div>

      {/* Pricing comparison cards */}
      <div className="mx-auto max-w-5xl space-y-4">
        {rows.map((row, i) => (
          <div
            key={row.product}
            className={cn(
              "flex flex-col gap-4 rounded-xl border p-6 transition-all md:flex-row md:items-center md:justify-between",
              i === 0
                ? "border-[#1C91FF]/30 bg-[#1C91FF]/5 shadow-sm"
                : "border-gray-100 bg-white hover:shadow-sm"
            )}
          >
            <div className="flex items-center gap-4 md:w-1/5">
              <H4 className={cn(i === 0 ? "text-highlight" : "")}>
                {row.product}
              </H4>
            </div>
            <div className="md:w-1/5">
              <P size="xs" className="font-medium text-muted-foreground">
                Price
              </P>
              <P size="sm" className="font-bold text-foreground">
                {row.price}
              </P>
            </div>
            <div className="md:w-2/5">
              <P size="xs" className="font-medium text-muted-foreground">
                Includes
              </P>
              <P size="xs" className="text-foreground">
                {row.includes}
              </P>
            </div>
            <div className="md:w-1/5">
              <P size="xs" className="font-medium text-muted-foreground">
                Note
              </P>
              <P size="xs" className="text-muted-foreground">
                {row.caveat}
              </P>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
