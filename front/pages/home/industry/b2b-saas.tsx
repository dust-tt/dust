import { Button, Chip, CompanyIcon, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";

import {
  DemoVideo,
  Stories,
} from "@app/components/home/content/Industry/configs/b2bSaasConfig";
import { CustomerStoriesSection } from "@app/components/home/content/Solutions/CustomerStoriesSection";
import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { Grid, H1, H2, H3, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import TrustedBy from "@app/components/home/TrustedBy";
import { classNames } from "@app/lib/utils";

const GRID_SECTION_CLASSES = classNames(
  "flex flex-col gap-16",
  "col-span-12",
  "lg:col-span-12 lg:col-start-1",
  "xl:col-span-12 xl:col-start-1",
  "2xl:col-start-1"
);

const CustomHeroSection = () => (
  <div className="container flex w-full flex-col px-6 pt-8 md:px-4 md:pt-24">
    <Grid className="gap-x-4 lg:gap-x-8">
      <div className="col-span-12 flex flex-col justify-center py-4 text-left lg:col-span-6 lg:col-start-1">
        <div className="mb-4">
          <Chip label="B2B SaaS" color="rose" size="sm" icon={CompanyIcon} />
        </div>
        <H1
          mono
          className="mb-4 text-4xl font-medium leading-tight md:text-5xl lg:text-6xl xl:text-7xl"
        >
          Dust for
          <br /> B2B SaaS
        </H1>
        <P size="lg" className="pb-6 text-muted-foreground md:max-w-lg md:pb-8">
          The AI Solution Trusted by Leading SaaS Innovators. Say goodbye to
          scattered info, manual busywork, and buried insights.
        </P>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Link href="/home/pricing" shallow={true}>
            <Button
              variant="highlight"
              size="md"
              label="Get started"
              className="w-full sm:w-auto"
            />
          </Link>
          <Button
            variant="outline"
            size="md"
            label="Talk to sales"
            href="/home/contact"
            className="w-full sm:w-auto"
          />
        </div>
      </div>

      <div className="relative col-span-12 mt-8 py-2 lg:col-span-6 lg:col-start-7 lg:mt-0">
        <div className="absolute -right-6 -top-10 -z-10 hidden h-24 w-24 lg:block">
          <img
            src="/static/landing/industry/shapes/rounded-rectangle.svg"
            alt="Rounded Rectangle"
            className="h-full w-full"
          />
        </div>
        <div className="absolute -bottom-10 left-8 -z-20 hidden h-48 w-48 lg:block">
          <img
            src="/static/landing/industry/shapes/diamond.svg"
            alt="diamond"
            className="h-full w-full"
          />
        </div>

        <div className="flex h-full w-full items-center justify-center">
          <div className="relative w-full max-w-xl xl:max-w-2xl">
            <div className="relative z-10 mx-auto flex w-full flex-col justify-between rounded-2xl bg-green-600 p-8 sm:p-10 lg:p-12">
              <div className="flex flex-1 flex-col justify-center">
                <H2
                  mono
                  className="mb-6 text-xl leading-relaxed text-white sm:mb-8 sm:text-2xl lg:text-3xl xl:text-4xl"
                >
                  "Dust is the most impactful software we've adopted since
                  building Clay."
                </H2>
              </div>
              <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                <div className="flex flex-col gap-1">
                  <P size="md" className="font-medium text-white">
                    Everett Berry
                  </P>
                  <P size="md" className="text-green-100">
                    Head of GTM Engineering at Clay
                  </P>
                </div>
                <div className="flex sm:justify-end">
                  <img
                    src="/static/landing/logos/color/clay-white.svg"
                    alt="Clay logo"
                    className="h-14 w-auto sm:h-16 lg:h-20"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Grid>
  </div>
);

const AIAgentsSection = () => (
  <div className="rounded-2xl bg-gray-50 py-12 md:py-16">
    <div className="container mx-auto max-w-4xl px-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <H2
          mono
          className="text-center text-3xl sm:text-4xl md:text-5xl lg:text-6xl"
        >
          What If Your Best People Focused Only on Growth?
        </H2>
        <P size="lg" className="max-w-3xl text-center text-muted-foreground">
          Accelerate your SaaS growth with AI agents designed for modern
          business challenges. Dust handles the heavy lifting on sales
          enablement, customer support, and market intelligence—empowering your
          teams to focus on strategic decisions that drive growth and
          competitive advantage.
        </P>
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link href="/home/pricing" shallow={true}>
            <Button
              variant="highlight"
              size="md"
              label="Get started"
              icon={RocketIcon}
              className="w-full max-w-xs sm:w-auto"
            />
          </Link>
          <Link href="/home/contact" shallow={true}>
            <Button
              variant="outline"
              size="md"
              label="Talk to sales"
              className="w-full max-w-xs sm:w-auto"
            />
          </Link>
        </div>
      </div>
    </div>
  </div>
);

// Pain points data
const PAIN_POINTS = [
  {
    icon: "/static/landing/industry/d-blue.svg",
    title: "Sales Teams Waste Time on Admin & Information Hunting",
    description:
      "Sales reps spend hours researching accounts, writing RFP responses, and managing routine communications—instead of closing deals.",
    color: "blue",
  },
  {
    icon: "/static/landing/industry/d-red.svg",
    title: "Critical Insights Remain Trapped in Silos",
    description:
      "Valuable data scattered across tools prevents teams from making informed decisions and capitalizing on opportunities.",
    color: "red",
  },
  {
    icon: "/static/landing/industry/d-green.svg",
    title: "Domain Experts Become Bottlenecks",
    description:
      "Key knowledge holders are overwhelmed with repetitive questions, limiting their strategic impact and slowing team velocity.",
    color: "green",
  },
];

const PainPointsSection = () => (
  <div className="py-12 md:py-16">
    <div className="container mx-auto px-6">
      <H2 className="mb-8 text-left text-3xl sm:text-4xl md:mb-12 md:text-5xl lg:text-6xl">
        3 Pain Points Dust Solves
      </H2>
      <div className="grid gap-6 sm:gap-8 md:grid-cols-3">
        {PAIN_POINTS.map((point, index) => (
          <div key={index} className="rounded-2xl bg-gray-50 p-8">
            <div className="mb-6 flex h-12 w-12 items-center justify-center">
              <img
                src={point.icon}
                alt={`${point.color} geometric shape`}
                className="h-full w-full object-contain"
              />
            </div>
            <H3 className="mb-4">{point.title}</H3>
            <P size="sm" className="text-muted-foreground">
              {point.description}
            </P>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Use case feature data
const USE_CASE_FEATURES = {
  gtm: {
    title: "GTM Operations & Sales Enablement",
    image: "/static/landing/industry/features/GTM_ops.svg",
    bgColor: "bg-blue-100",
    features: [
      {
        icon: "bg-red-500",
        title: "360° Account Intelligence",
        description:
          "Merge engagement, CRM, and market signals for every account.",
      },
      {
        icon: "bg-yellow-400 rounded-tr-full",
        title: "Automated Follow-Ups",
        description:
          "Automate customer follow-ups and update your CRM using meeting transcripts and notes.",
      },
      {
        icon: "bg-blue-500 rounded-bl-full",
        title: "Prospect Questions",
        description:
          "Automate RFP responses and prospect answers using your internal knowledge base.",
      },
      {
        icon: "bg-sky-400 rounded-br-full",
        title: "Revenue Intelligence",
        description:
          "Extract actionable insights from customer-facing interactions",
      },
    ],
  },
  marketing: {
    title: "Marketing Operations",
    image: "/static/landing/industry/features/marketing_operations.svg",
    bgColor: "bg-rose-100",
    features: [
      {
        icon: "bg-pink-400 rounded-tl-full",
        title: "Content Localization at Scale",
        description:
          "Launch campaigns globally, keeping brand and technical consistency",
      },
      {
        icon: "bg-red-500",
        title: "Market Intelligence",
        description:
          "Monitor trends and competitors to equip GTM and sales teams",
      },
      {
        icon: "bg-yellow-400 rounded-tr-full",
        title: "Content Optimization",
        description: "Turn drafts into high-conversion assets",
      },
    ],
  },
  customer: {
    title: "Customer Experience",
    image: "/static/landing/industry/features/customer_experience.svg",
    bgColor: "bg-green-100",
    features: [
      {
        icon: "bg-pink-400 rounded-tl-full",
        title: "AI Ticket Deflection & Routing",
        description:
          "Rapidly resolve L1 cases, route complex issues, and ensure SLA compliance",
      },
      {
        icon: "bg-red-500",
        title: "Accelerated Case Resolution",
        description:
          "Suggest docs, similar tickets, and pre-draft responses for agents",
      },
      {
        icon: "bg-yellow-400 rounded-tr-full",
        title: "Knowledge Base Automation",
        description:
          "Turn support resolutions into always-fresh, searchable documentation",
      },
      {
        icon: "bg-green-500",
        title: "Support Analytics",
        description:
          "Analyze customer interactions to surface insights, optimize documentation, and improve CSAT",
      },
    ],
  },
  engineering: {
    title: "Engineering Operations",
    image: "/static/landing/industry/features/engineering_ops.svg",
    bgColor: "bg-gray-100",
    features: [
      {
        icon: "bg-pink-400 rounded-tl-full",
        title: "AI-Powered Code Debugging",
        description:
          "Surface relevant context, docs, and historical issues inside your IDE",
      },
      {
        icon: "bg-red-500",
        title: "Automated Code Reviews",
        description: "Maintain standards and compliance at scale",
      },
      {
        icon: "bg-yellow-400 rounded-tr-full",
        title: "Incident Response",
        description:
          "Execute automated runbooks, integrate communications, and enable rapid root cause analysis",
      },
      {
        icon: "bg-green-500",
        title: "Continuous Doc Generation",
        description:
          "Keep user and API docs up-to-date from code changes automatically",
      },
    ],
  },
};

// Reusable component for use case sections
const UseCaseBlock = ({
  useCase,
  imageFirst = true,
}: {
  useCase: typeof USE_CASE_FEATURES.gtm;
  imageFirst?: boolean;
}) => (
  <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
    {/* Image Block */}
    <div
      className={classNames(
        "flex items-center justify-center",
        imageFirst ? "order-1 lg:order-1" : "order-1 lg:order-2"
      )}
    >
      <div className="w-full">
        <div
          className={classNames(
            "relative w-full overflow-hidden rounded-lg",
            useCase.bgColor
          )}
        >
          <img
            src={useCase.image}
            alt={`${useCase.title} Features`}
            className="h-auto w-full object-contain"
          />
        </div>
      </div>
    </div>

    {/* Content Block */}
    <div
      className={classNames(
        "flex flex-col justify-center",
        imageFirst ? "order-2 lg:order-2" : "order-2 lg:order-1"
      )}
    >
      <H3 className="mb-6">{useCase.title}</H3>
      <div className="space-y-6">
        {useCase.features.map((feature, index) => (
          <div key={index}>
            <div className="flex items-start gap-3">
              <div
                className={classNames(
                  "mt-1 h-6 w-6 flex-shrink-0",
                  feature.icon
                )}
              ></div>
              <div>
                <P size="sm" className="font-medium">
                  {feature.title}
                </P>
                <P size="sm" className="text-muted-foreground">
                  {feature.description}
                </P>
              </div>
            </div>
            {index < useCase.features.length - 1 && (
              <hr className="mt-6 border-gray-200" />
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

const DustInActionSection = () => (
  <div className="py-12 md:py-16">
    <div className="container mx-auto px-6">
      {/* Left-aligned Title Section */}
      <div className="mb-12 flex flex-col text-left">
        <H2 className="mb-2 text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
          Dust in Action
        </H2>
      </div>

      {/* Use Case Sections */}
      <div className="space-y-16">
        <UseCaseBlock useCase={USE_CASE_FEATURES.gtm} imageFirst={true} />
        <UseCaseBlock
          useCase={USE_CASE_FEATURES.marketing}
          imageFirst={false}
        />
        <UseCaseBlock useCase={USE_CASE_FEATURES.customer} imageFirst={true} />
        <UseCaseBlock
          useCase={USE_CASE_FEATURES.engineering}
          imageFirst={false}
        />
      </div>
    </div>
  </div>
);

// Impact metrics data
const IMPACT_METRICS = [
  {
    value: "80",
    unit: "%",
    type: "Reduction",
    description: "in prospection time with automated lead enrichment",
    bgColor: "bg-blue-300",
    badgeColor: "bg-pink-300",
    badgeTextColor: "text-gray-900",
    borderRadius: "rounded-t-full",
  },
  {
    value: "60",
    unit: "%",
    type: "Increase",
    description: "in lead qualification speed with intelligent scoring",
    bgColor: "bg-pink-300",
    badgeColor: "bg-red-500",
    badgeTextColor: "text-white",
    borderRadius: "rounded-l-full",
  },
  {
    value: "40",
    unit: "%",
    type: "Faster",
    description: "customer support resolution with AI-powered insights",
    bgColor: "bg-lime-300",
    badgeColor: "bg-green-600",
    badgeTextColor: "text-white",
    borderRadius: "rounded-r-full",
  },
];

const ImpactMetricsSection = () => (
  <div className="rounded-xl bg-blue-50 py-20">
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
        {IMPACT_METRICS.map((metric, index) => (
          <div key={index} className="flex flex-col text-left">
            <div className="mb-4 md:mb-8">
              <span className="text-5xl font-bold text-gray-900 md:text-8xl">
                {metric.value}
                {metric.unit}
              </span>
            </div>
            <H3 className="mb-2 text-xl md:text-2xl">{metric.type}</H3>
            <P className="text-sm text-muted-foreground md:text-base">
              {metric.description}
            </P>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const TestimonialSection = () => (
  <div className="rounded-xl bg-green-600 py-8 md:py-16">
    <div className="container mx-auto px-6 md:px-8 lg:px-12">
      <div className="flex flex-col justify-center">
        <H1 className="mb-10 text-3xl !font-normal text-white sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl">
          "Dust is the most impactful software we've adopted since building
          Clay."
        </H1>
        <div className="flex flex-col gap-4 pt-8 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <div>
            <P size="lg" className="font-medium text-white">
              Everett Berry
            </P>
            <P size="lg" className="text-green-100">
              Head of GTM Engineering at Clay
            </P>
          </div>
          <div className="flex sm:flex-shrink-0 sm:justify-end">
            <img
              src="/static/landing/logos/color/clay-white.svg"
              alt="Clay logo"
              className="h-16 w-auto sm:h-20"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const JustUseDustSection = () => (
  <div className="relative overflow-hidden rounded-xl bg-blue-50 py-16 md:py-20">
    {/* Decorative Shapes */}
    <div className="absolute left-0 top-0 h-48 w-48 -translate-x-1/3 -translate-y-1/3 rounded-full bg-brand-pink-rose" />
    <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/3 translate-x-1/3 rotate-45 bg-brand-electric-blue" />
    <div className="absolute bottom-0 left-0 h-40 w-40 -translate-x-1/3 translate-y-1/3 rounded-full bg-brand-hunter-green" />
    <div className="absolute bottom-0 right-0 h-40 w-40 translate-x-1/3 translate-y-1/3 bg-brand-red-rose" />

    <div className="container mx-auto max-w-4xl px-6">
      <div className="relative flex flex-col items-center justify-center py-12 text-center md:py-16">
        <H2 className="mb-8 text-4xl text-blue-600 sm:text-5xl md:text-6xl">
          Just use Dust
        </H2>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Link href="/api/auth/login" passHref legacyBehavior>
            <Button
              variant="highlight"
              size="md"
              label="Start Free Trial"
              className="w-full sm:w-auto"
            />
          </Link>
          <Link href="/home/contact" passHref legacyBehavior>
            <Button
              variant="outline"
              size="md"
              label="Contact Sales"
              className="w-full sm:w-auto"
            />
          </Link>
        </div>
      </div>
    </div>
  </div>
);

export default function B2BSaaS() {
  return (
    <div className="container flex w-full flex-col gap-16 px-2 py-2 pb-12">
      <CustomHeroSection />
      <AIAgentsSection />
      <TrustedBy />
      <PainPointsSection />
      <DustInActionSection />
      <ImpactMetricsSection />
      <Grid>
        <div className={GRID_SECTION_CLASSES}>
          <DemoVideoSection demoVideo={DemoVideo} />
        </div>
      </Grid>
      <TrustedBy />
      <TestimonialSection />
      <Grid>
        <div className={GRID_SECTION_CLASSES}>
          <CustomerStoriesSection title="Customer stories" stories={Stories} />
        </div>
      </Grid>
      <JustUseDustSection />
    </div>
  );
}

B2BSaaS.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
