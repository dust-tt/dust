import type { FC } from "react";
import {
  Avatar,
  Hover3D,
  Icon,
  LightbulbIcon,
  RocketIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { Grid, H2 } from "@app/components/home/ContentComponents";

type SparkleIcon = React.ComponentType<{
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}>;

export interface Benefit {
  icon: SparkleIcon;
  title: string;
  description: string;
}

interface BenefitsSectionProps {
  title?: string;
  benefits?: Benefit[];
  fromColor?: string;
  toColor?: string;
}

export const defaultBenefits: Benefit[] = [
  {
    icon: RocketIcon,
    title: "Resolve Issues Faster",
    description:
      "Surface relevant information from all connected knowledge bases instantly and understand messages in 50+ languages.",
  },
  {
    icon: UserGroupIcon,
    title: "Boost Team Productivity",
    description:
      "Keep teams synchronized with real-time access to information across all communication channels and reduce onboarding time.",
  },
  {
    icon: LightbulbIcon,
    title: "Understand Customer Needs",
    description:
      "Gain insights from cross-tool interactions to understand and act on customer needs, improve documentation.",
  },
];

export const BenefitsSection: FC<BenefitsSectionProps> = ({
  title = "Elevate support operations",
  benefits = defaultBenefits,
  fromColor = "from-sky-200",
  toColor = "to-sky-500",
}) => (
  <section className="w-full py-12 pb-0">
    <Grid>
      <div className="col-span-12 mb-2">
        <H2 from={fromColor} to={toColor}>
          {title}
        </H2>
      </div>

      <div className="col-span-12 grid grid-cols-1 gap-8 pt-8 md:grid-cols-3">
        {benefits.map((benefit, index) => (
          <ImgBlock
            key={index}
            title={<>{benefit.title}</>}
            content={<>{benefit.description}</>}
            className="h-full flex-1"
          >
            <Hover3D
              depth={-20}
              perspective={1000}
              className="justify-left relative flex h-8 items-center"
            >
              <Avatar
                size="xl"
                visual={
                  <Icon
                    visual={benefit.icon}
                    className="text-slate-300"
                    size="xl"
                  />
                }
                backgroundColor="bg-slate-700"
              />
            </Hover3D>
          </ImgBlock>
        ))}
      </div>
    </Grid>
  </section>
);
