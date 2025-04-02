import { Avatar, Icon } from "@dust-tt/sparkle";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { H2 } from "@app/components/home/ContentComponents";

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
  color?: "blue" | "green" | "rose" | "golden";
}

interface BenefitsSectionProps {
  benefits: BenefitsProps;
  page?: string;
}

export function BenefitsSection({ benefits }: BenefitsSectionProps) {
  return (
    <section className="w-full pt-24">
      {benefits.sectionTitle && (
        <div className="mb-6">
          <H2>{benefits.sectionTitle}</H2>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {benefits.items.map((benefit, index) => (
          <ImgBlock
            key={index}
            title={<div className="md:text-left">{benefit.title}</div>}
            content={<>{benefit.description}</>}
            className="h-full flex-1 md:text-left"
          >
            <div className="relative flex h-8 items-center justify-center sm:justify-start">
              <Avatar
                size="xl"
                visual={
                  <Icon
                    visual={benefit.icon}
                    className="text-primary-200"
                    size="xl"
                  />
                }
                backgroundColor="bg-primary-700"
              />
            </div>
          </ImgBlock>
        ))}
      </div>
    </section>
  );
}
