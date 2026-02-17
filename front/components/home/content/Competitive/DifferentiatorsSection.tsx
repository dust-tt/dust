import { H2, P } from "@app/components/home/ContentComponents";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import {
  BoltIcon,
  BookOpenIcon,
  Icon,
  RobotIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";

type IconType = "robot" | "bolt" | "book" | "users";
type IconColor = "green" | "orange" | "blue" | "red";

interface Differentiator {
  title: string;
  description: string;
  iconColor: IconColor;
  icon: IconType;
}

interface DifferentiatorsSectionProps {
  differentiators: Differentiator[];
  title?: string;
  subtitle?: string;
}

const iconMap = {
  robot: RobotIcon,
  bolt: BoltIcon,
  book: BookOpenIcon,
  users: UserGroupIcon,
};

const colorMap = {
  green: {
    iconBg: "bg-emerald-500",
    cardBg: "bg-white",
  },
  orange: {
    iconBg: "bg-amber-500",
    cardBg: "bg-white",
  },
  blue: {
    iconBg: "bg-blue-500",
    cardBg: "bg-white",
  },
  red: {
    iconBg: "bg-rose-500",
    cardBg: "bg-white",
  },
};

function DifferentiatorCard({
  title,
  description,
  iconColor,
  icon,
}: Differentiator) {
  const IconComponent = iconMap[icon];
  const colors = colorMap[iconColor];

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-gray-100 p-6 shadow-sm transition-shadow hover:shadow-md",
        colors.cardBg
      )}
    >
      <div
        className={cn(
          "mb-4 flex h-12 w-12 items-center justify-center rounded-xl",
          colors.iconBg
        )}
      >
        <Icon visual={IconComponent} className="h-6 w-6 text-white" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
      <P size="sm" className="text-muted-foreground">
        {description}
      </P>
    </div>
  );
}

export function DifferentiatorsSection({
  differentiators,
  title = "What makes Dust different",
  subtitle = "Dust is the first platform for building custom AI agents that understand your business, use your tools, and work safely alongside your team",
}: DifferentiatorsSectionProps) {
  return (
    <section className="w-full">
      <div className="mb-8 text-center">
        <H2 className="mb-3 text-center">{title}</H2>
        <P size="md" className="mx-auto max-w-3xl text-muted-foreground">
          {subtitle}
        </P>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {differentiators.map((diff, index) => (
          <DifferentiatorCard key={index} {...diff} />
        ))}
      </div>
    </section>
  );
}
