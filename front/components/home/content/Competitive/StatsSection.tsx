import { H2, P } from "@app/components/home/ContentComponents";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import Image from "next/image";

interface Stat {
  value: string;
  label: string;
  company: string;
  logo: string;
}

interface StatsSectionProps {
  stats: Stat[];
  title?: string;
  subtitle?: string;
}

const colorSchemes = [
  {
    bg: "bg-gradient-to-br from-blue-50 to-blue-100",
    text: "text-blue-600",
    border: "border-blue-200",
  },
  {
    bg: "bg-gradient-to-br from-purple-50 to-purple-100",
    text: "text-purple-600",
    border: "border-purple-200",
  },
  {
    bg: "bg-gradient-to-br from-emerald-50 to-emerald-100",
    text: "text-emerald-600",
    border: "border-emerald-200",
  },
  {
    bg: "bg-gradient-to-br from-amber-50 to-amber-100",
    text: "text-amber-600",
    border: "border-amber-200",
  },
];

interface StatCardProps extends Stat {
  colorIndex: number;
}

function StatCard({ value, label, company, logo, colorIndex }: StatCardProps) {
  const colors = colorSchemes[colorIndex % colorSchemes.length];

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border p-6 text-center shadow-sm",
        colors.bg,
        colors.border
      )}
    >
      <div className={cn("mb-2 text-4xl font-bold md:text-5xl", colors.text)}>
        {value}
      </div>
      <div className="mb-4 text-sm font-medium text-gray-600">{label}</div>
      <div className="mt-auto flex items-center gap-2">
        <Image src={logo} width={160} height={48} alt={company} unoptimized />
      </div>
    </div>
  );
}

export function StatsSection({
  stats,
  title = "Real results. Real fast.",
  subtitle = "Teams see measurable impact within the first week",
}: StatsSectionProps) {
  return (
    <section className="w-full">
      <div className="mb-8 text-center">
        <H2 className="mb-2 text-center">{title}</H2>
        <P size="md" className="text-muted-foreground">
          {subtitle}
        </P>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} colorIndex={index} />
        ))}
      </div>
    </section>
  );
}
