import { HomeCountUp } from "@app/components/home/content/Product/HomeCountUp";
import { HomeQuoteMark } from "@app/components/home/content/Product/HomeQuoteMark";
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";

interface ImpactMetric {
  label: string;
  to: number;
  format: (n: number) => string;
  suffix: string;
}

const METRICS: ImpactMetric[] = [
  {
    label: "Agents deployed",
    to: 300000,
    format: (n) => n.toLocaleString("en-US"),
    suffix: "+",
  },
  {
    label: "Conversations",
    to: 12,
    format: (n) => String(n),
    suffix: "M",
  },
  {
    label: "Weekly active users",
    to: 70,
    format: (n) => String(n),
    suffix: "%",
  },
];

// Quiet stats row. Previously this section sat on a bright bg-blue-100 panel
// with three white cards, each carrying a half-disc icon and a saturated
// brand-color number — the loudest moment on the homepage. Reduced to an
// open hairline divide-x row on the page background, monochrome numbers,
// muted labels. Hierarchy comes from size and space, not color.
export function HomeImpactMetricsSection() {
  return (
    <section className="w-full bg-background py-24">
      <div className="mx-auto w-full max-w-[1180px] px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
          {METRICS.map((metric, index) => (
            <HomeReveal
              key={metric.label}
              delay={index * 80}
              className="flex flex-col items-start gap-3 sm:px-10 sm:first:pl-0 sm:last:pr-0"
            >
              <HomeQuoteMark size={14} />
              <div className="text-5xl font-semibold leading-[1] tracking-[-0.03em] text-foreground md:text-6xl">
                <HomeCountUp
                  to={metric.to}
                  format={metric.format}
                  suffix={metric.suffix}
                  durationMs={1400}
                />
              </div>
              <div className="text-sm leading-[1.4] text-muted-foreground">
                {metric.label}
              </div>
            </HomeReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
