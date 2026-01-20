import {
  BarChartIcon,
  CardIcon,
  ChatBubbleBottomCenterTextIcon,
  ClockIcon,
  LockIcon,
  RocketIcon,
  SparklesIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import { Grid, H2 } from "@app/components/home/ContentComponents";

import type { BenefitCard, BenefitIconType } from "./types";

const BENEFIT_ICONS: Record<
  BenefitIconType,
  ComponentType<{ className?: string }>
> = {
  rocket: RocketIcon,
  users: UserGroupIcon,
  dollar: CardIcon,
  chart: BarChartIcon,
  sparkles: SparklesIcon,
  chat: ChatBubbleBottomCenterTextIcon,
  clock: ClockIcon,
  shield: LockIcon,
};

interface WhyChooseSectionProps {
  title?: string;
  benefits: BenefitCard[];
}

export function WhyChooseSection({
  title = "Why teams choose Dust",
  benefits,
}: WhyChooseSectionProps) {
  return (
    <div className="py-12 md:py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-10 text-center text-2xl font-semibold text-foreground md:text-3xl">
            {title}
          </H2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit, index) => {
              const Icon = BENEFIT_ICONS[benefit.icon];
              return (
                <div
                  key={index}
                  className="group rounded-2xl border border-border bg-white p-6 transition-all hover:border-green-200"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-600">
                    <Icon className="h-6 w-6" />
                  </div>

                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {benefit.title}
                  </h3>

                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {benefit.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </Grid>
    </div>
  );
}
