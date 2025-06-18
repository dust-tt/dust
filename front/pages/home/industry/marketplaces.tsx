import { Button, Chip, CompanyIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";

import { DemoVideo as BaseDemoVideo } from "@app/components/home/content/Solutions/configs/supportConfig";
import { CustomerStoriesSection } from "@app/components/home/content/Solutions/CustomerStoriesSection";
import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { Grid, H1, H2, H3, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import TrustedBy from "@app/components/home/TrustedBy";
import { classNames } from "@app/lib/utils";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

const DemoVideo = {
  ...BaseDemoVideo,
  sectionTitle: "See Dust in action for Marketplaces",
  videoUrl: "https://fast.wistia.net/embed/iframe/r0dwaexoez",
};

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
          <Chip label="Marketplace" color="blue" size="sm" icon={CompanyIcon} />
        </div>
        <H1
          mono
          className="mb-4 text-4xl font-medium leading-tight md:text-5xl lg:text-6xl xl:text-7xl"
        >
          Dust for <br /> Marketplaces
        </H1>
        <P size="lg" className="pb-6 text-muted-foreground md:max-w-lg md:pb-8">
          The AI Solution Powering Marketplace Success. Streamline supplier acquisition, eliminate content bottlenecks, and scale support effortlessly.
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
        {/* Decorative shapes and testimonial */}
        <div className="flex h-full w-full items-center justify-center">
          <div className="relative w-full max-w-xl xl:max-w-2xl">
            <div className="relative z-10 mx-auto flex w-full flex-col justify-between rounded-2xl bg-green-600 p-8 sm:p-10 lg:p-12">
              <div className="flex flex-1 flex-col justify-center">
                <H2
                  mono
                  className="mb-6 text-xl leading-relaxed text-white sm:mb-8 sm:text-2xl lg:text-3xl xl:text-4xl"
                >
                  "Dust has empowered our employees to work smarter, innovate, and push boundaries."
                </H2>
              </div>
              <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                <div className="flex flex-col gap-1">
                  <P size="md" className="font-medium text-white">
                    Matthieu Birach
                  </P>
                  <P size="md" className="text-green-100">
                    Chief People Officer at Doctolib
                  </P>
                </div>
                <div className="flex sm:justify-end">
                  <img
                    src="/static/landing/logos/color/doctolib_white.png"
                    alt="Doctolib logo"
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
            What if your teams focused on growth?
          </H2>
          <P size="lg" className="max-w-3xl text-center text-muted-foreground">
            Deploy agents that research information, share insights across teams,
            and automate routine tasks—handling all the time-consuming work that
            slows you down. Your teams focus on growing your business while
            leveraging everything your organization has already built.
          </P>
        </div>
      </div>
    </div>
  );  

const PAIN_POINTS = [
    {
      icon: "/static/landing/industry/d-blue.svg",
      title: "Accelerate quality provider acquisition",
      description:
        "Transform prospecting and qualification with automated workflows. Sign the best suppliers faster while efficiently answering all provider questions.",
      color: "blue",
    },
    {
      icon: "/static/landing/industry/d-red.svg",
      title: "Scale content creation effortlessly",
      description:
        "Generate targeted, high-quality content at scale to keep supplier and customer communities engaged across all your markets.",
      color: "red",
    },
    {
      icon: "/static/landing/industry/d-green.svg",
      title: "Scale your best support expertise instantly",
      description:
        "Let AI handle tier 1 & 2 support so your experts can focus on complex cases that drive real marketplace value.",
      color: "green",
    },
  ];

const PainPointsSection = () => (
  <div className="py-12 md:py-16">
    <div className="container mx-auto px-6">
      <H2 className="mb-8 text-left text-3xl sm:text-4xl md:mb-12 md:text-5xl lg:text-6xl">
        The 3 marketplace bottlenecks Dust solves
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

// Use case feature data for marketplaces
const USE_CASE_FEATURES = {
  supply: {
    title: "Supply Growth & Provider Acquisition",
    image: "/static/landing/industry/features/supply_growth.svg",
    bgColor: "bg-blue-100",
    features: [
      {
        icon: "bg-blue-500",
        title: "Prospection & Lead Enrichment",
        description:
          "Automatically aggregate and enrich provider data from public and marketplace insights.",
      },
      {
        icon: "bg-yellow-400 rounded-tr-full",
        title: "Account 360° View",
        description:
          "Get comprehensive provider overviews combining platform activity, performance, and history.",
      },
      {
        icon: "bg-green-500",
        title: "Sales Enablement",
        description:
          "Auto-draft responses to provider inquiries using your latest policies and product info.",
      },
      {
        icon: "bg-pink-400 rounded-tl-full",
        title: "Sales Insights",
        description:
          "Extract winning narratives from calls and coach teams on pitch delivery.",
      },
    ],
  },
  support: {
    title: "Support & Success Automation",
    image: "/static/landing/industry/features/support_success.svg",
    bgColor: "bg-green-100",
    features: [
      {
        icon: "bg-sky-400 rounded-br-full",
        title: "Smart Request Routing",
        description:
          "Route issues to the right team instantly, based on urgency and type.",
      },
      {
        icon: "bg-red-500",
        title: "Technical Troubleshooting",
        description:
          "Accelerate resolution with deep troubleshooting and suggested paths.",
      },
      {
        icon: "bg-yellow-400 rounded-tr-full",
        title: "Customer Communication",
        description:
          "Craft clear, professional support communication at scale.",
      },
      {
        icon: "bg-green-500",
        title: "Support Insights",
        description:
          "Analyze interactions and feedback to improve marketplace experience.",
      },
    ],
  },
  community: {
    title: "Community Operations",
    image: "/static/landing/industry/features/community_ops.svg",
    bgColor: "bg-rose-100",
    features: [
      {
        icon: "bg-blue-500",
        title: "Automated KYC & Verification",
        description:
          "Extract and validate provider documents, flagging issues for compliance.",
      },
      {
        icon: "bg-pink-400 rounded-tl-full",
        title: "Community Engagement",
        description:
          "Generate targeted content to keep your provider community engaged.",
      },
      {
        icon: "bg-red-500",
        title: "Community Education",
        description:
          "Deliver updates and education to keep your providers active and successful.",
      },
    ],
  },
  intelligence: {
    title: "Marketing & Marketplace Intelligence",
    image: "/static/landing/industry/features/marketplace_analytics.svg",
    bgColor: "bg-yellow-100",
    features: [
      {
        icon: "bg-yellow-400 rounded-tr-full",
        title: "Content Creation & Localization",
        description:
          "SEO-optimized communications across multiple languages and markets.",
      },
      {
        icon: "bg-blue-500",
        title: "Industry & Competitive Intelligence",
        description:
          "Monitor competitive activity and pricing trends for platform strategy.",
      },
      {
        icon: "bg-green-500",
        title: "Customer Insights",
        description:
          "Summarize feedback to identify improvement areas.",
      },
      {
        icon: "bg-pink-400 rounded-tl-full",
        title: "Marketplace Analytics",
        description:
          "Retrieve analytics for internal and stakeholder reporting.",
      },
    ],
  },
};

const UseCaseBlock = ({
  useCase,
  imageFirst = true,
}: {
  useCase: typeof USE_CASE_FEATURES.supply;
  imageFirst?: boolean;
}) => (
  <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
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
      <div className="mb-12 flex flex-col text-left">
        <H2 className="mb-2 text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
          Dust in Action
        </H2>
      </div>
      <div className="space-y-16">
        <UseCaseBlock useCase={USE_CASE_FEATURES.supply} imageFirst={true} />
        <UseCaseBlock useCase={USE_CASE_FEATURES.support} imageFirst={false} />
        <UseCaseBlock useCase={USE_CASE_FEATURES.community} imageFirst={true} />
        <UseCaseBlock useCase={USE_CASE_FEATURES.intelligence} imageFirst={false} />
      </div>
    </div>
  </div>
);

const IMPACT_METRICS = [
  {
    value: "80",
    unit: "%",
    type: "Adoption",
    description: "weekly active users",
    bgColor: "bg-blue-300",
    badgeColor: "bg-pink-300",
    badgeTextColor: "text-gray-900",
    borderRadius: "rounded-t-full",
  },
  {
    value: "50",
    unit: "%",
    type: "Faster",
    description: "support ticket resolution through smart routing",
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
          "Dust has empowered our employees to work smarter, innovate, and push boundaries."
        </H1>
        <div className="flex flex-col gap-4 pt-8 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <div>
            <P size="lg" className="font-medium text-white">
              Matthieu Birach
            </P>
            <P size="lg" className="text-green-100">
              Chief People Officer at Doctolib
            </P>
          </div>
          <div className="flex sm:flex-shrink-0 sm:justify-end">
            <img
              src="/static/landing/logos/color/doctolib_white.png"
              alt="Doctolib logo"
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

export default function Marketplaces() {
  return (
    <div className="container flex w-full flex-col gap-16 px-2 py-2 pb-12">
      <CustomHeroSection />
      <AIAgentsSection />
      <TrustedBy title="Trusted by Marketplace Leaders" logoSet="marketplaces" />
      <PainPointsSection />
      <DustInActionSection />
      <ImpactMetricsSection />
      <Grid>
        <div className={GRID_SECTION_CLASSES}>
          <DemoVideoSection demoVideo={DemoVideo} />
        </div>
      </Grid>
      <TestimonialSection />
      <Grid>
        <div className={GRID_SECTION_CLASSES}>
            <CustomerStoriesSection
                title="Customer stories"
                stories={[
                {
                    title: "Malt cuts support ticket closing time by 50% with Dust",
                    content:
                    "Malt streamlines customer support using Dust’s AI platform for rapid, consistent multilingual responses.",
                    href: "https://blog.dust.tt/malt-customer-support/",
                    src: "https://blog.dust.tt/content/images/size/w2000/2024/12/Malt_Customer_Story_Dust_Support.jpg",
                },
                {
                    title: "Blueground accelerates customer support resolution time with Dust",
                    content:
                      "Discover how Blueground boosted satisfaction and cut resolution time using Dust agents.",
                    href: "https://blog.dust.tt/customer-support-blueground/",
                    src: "https://blog.dust.tt/content/images/size/w2000/2025/06/Blueground_dust.jpg",
                  },
                // {
                //     title:
                //     "50% Time Savings: How Didomi Transformed Privacy Compliance with AI",
                //     content:
                //     "Didomi's legal team cuts workload by 50% using Dust's AI assistants for privacy compliance and legal document management.",
                //     href: "https://blog.dust.tt/how-thomas-uses-ai-assistants-to-manage-legal-and-data-privacy-at-didomi/",
                //     src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_didomi.png",
                // },
                ]}
            />
        </div>
      </Grid>
      <JustUseDustSection />
    </div>
  );
}

Marketplaces.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};