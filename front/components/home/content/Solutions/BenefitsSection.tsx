import { Avatar, Hover3D, Icon } from "@dust-tt/sparkle";
import type { FC } from "react";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { Grid, H2 } from "@app/components/home/ContentComponents";

type SparkleIcon = React.ComponentType<{
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}>;

export interface BenefitsProps {
  sectionTitle?: string;
  items: {
    icon: SparkleIcon;
    title: string;
    description: string;
  }[];
}

export interface MetricProps {
  metrics: {
    value: string;
    description: React.ReactNode;
  }[];
  from: string;
  to: string;
}

interface BenefitsSectionProps {
  benefits: BenefitsProps;
  fromColor: string;
  toColor: string;
}

export const BenefitsSection: FC<BenefitsSectionProps> = ({
  benefits,
  fromColor,
  toColor,
}) => (
  <section className="w-full py-12 pb-0">
    <Grid>
      <div className="col-span-12 mb-2">
        <H2 from={fromColor} to={toColor}>
          {benefits.sectionTitle}
        </H2>
      </div>

      <div className="col-span-12 grid grid-cols-1 gap-8 pt-8 md:grid-cols-3">
        {benefits.items.map((benefit, index) => (
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
