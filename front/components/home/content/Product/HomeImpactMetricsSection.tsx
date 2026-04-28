import { HomeCountUp } from "@app/components/home/content/Product/HomeCountUp";
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";

interface ImpactMetric {
  label: string;
  to: number;
  format: (n: number) => string;
  suffix: string;
  valueClass: string;
  iconBg: string;
  iconAccent: string;
}

const METRICS: ImpactMetric[] = [
  {
    label: "Agents deployed",
    to: 300000,
    format: (n) => n.toLocaleString("en-US"),
    suffix: "+",
    valueClass: "text-blue-500",
    iconBg: "bg-blue-200",
    iconAccent: "bg-blue-500",
  },
  {
    label: "Conversations",
    to: 12,
    format: (n) => String(n),
    suffix: "M",
    valueClass: "text-golden-500",
    iconBg: "bg-golden-200",
    iconAccent: "bg-golden-500",
  },
  {
    label: "Weekly active users",
    to: 70,
    format: (n) => String(n),
    suffix: "%",
    valueClass: "text-green-700",
    iconBg: "bg-green-200",
    iconAccent: "bg-green-600",
  },
];

export function HomeImpactMetricsSection() {
  return (
    <section className="w-full bg-blue-100 py-24">
      <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-6 px-6 md:grid-cols-3">
        {METRICS.map((metric, index) => (
          <HomeReveal
            key={metric.label}
            delay={index * 80}
            className="flex flex-col items-center gap-6 rounded-2xl bg-background px-8 py-8"
          >
            <div className="relative h-12 w-12">
              <div
                className={`absolute inset-0 rounded-full ${metric.iconBg}`}
              />
              <div
                className={`absolute inset-x-0 bottom-0 h-1/2 rounded-b-full ${metric.iconAccent}`}
              />
            </div>
            <div className="text-xl font-semibold leading-[100%] tracking-[-1px] text-foreground">
              {metric.label}
            </div>
            <div
              className={`heading-6xl lg:heading-7xl font-semibold leading-[100%] tracking-[-1px] ${metric.valueClass}`}
            >
              <HomeCountUp
                to={metric.to}
                format={metric.format}
                suffix={metric.suffix}
                durationMs={1400}
              />
            </div>
          </HomeReveal>
        ))}
      </div>
    </section>
  );
}
