import {
  BarChartIcon,
  CardIcon,
  ChatBubbleBottomCenterTextIcon,
  RocketIcon,
  SparklesIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";

import { Grid, H2 } from "@app/components/home/ContentComponents";

import type { BenefitCard, BenefitIconType } from "./types";

const BENEFIT_ICONS: Record<BenefitIconType, ReactNode> = {
  rocket: <RocketIcon className="h-6 w-6" />,
  users: <UserGroupIcon className="h-6 w-6" />,
  dollar: <CardIcon className="h-6 w-6" />,
  chart: <BarChartIcon className="h-6 w-6" />,
  sparkles: <SparklesIcon className="h-6 w-6" />,
  chat: <ChatBubbleBottomCenterTextIcon className="h-6 w-6" />,
  clock: <RocketIcon className="h-6 w-6" />,
  shield: <SparklesIcon className="h-6 w-6" />,
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
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="group rounded-2xl border border-border bg-white p-6 transition-all hover:border-green-200"
              >
                {/* Icon */}
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-600">
                  {BENEFIT_ICONS[benefit.icon]}
                </div>

                {/* Title */}
                <h3 className="mb-2 text-lg font-semibold text-foreground">
                  {benefit.title}
                </h3>

                {/* Description */}
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Grid>
    </div>
  );
}
