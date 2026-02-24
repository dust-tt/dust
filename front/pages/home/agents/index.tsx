import {
  ArrowRightIcon,
  CheckCircleIcon,
  Icon,
  RocketIcon,
  SparklesIcon,
} from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import {
  AGENTS,
  AGENTS_PAGE_CONFIG,
} from "@app/components/home/content/Agents/agentsConfig";
import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import { Grid, H2, H3, H4, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import TrustedBy from "@app/components/home/TrustedBy";
import UTMButton from "@app/components/UTMButton";
import { classNames } from "@app/lib/utils";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

const GRID_SECTION_CLASSES = classNames(
  "flex flex-col gap-8",
  "col-span-12",
  "lg:col-span-11 lg:col-start-2",
  "xl:col-span-11 xl:col-start-2",
  "2xl:col-start-3 2xl:col-span-10"
);

const BENEFIT_ICONS = [SparklesIcon, RocketIcon, CheckCircleIcon] as const;

export default function AgentsGallery() {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title={AGENTS_PAGE_CONFIG.seo.title}
        description={AGENTS_PAGE_CONFIG.seo.description}
        pathname={router.asPath}
      />
      <div className="container flex w-full flex-col gap-16 px-2 py-2 pb-12">
        {/* Hero */}
        <HeaderContentBlock
          uptitle={AGENTS_PAGE_CONFIG.hero.uptitle}
          title={AGENTS_PAGE_CONFIG.hero.title}
          subtitle={AGENTS_PAGE_CONFIG.hero.description}
          hasCTA={true}
        />

        <Grid>
          {/* Agent gallery */}
          <div className={GRID_SECTION_CLASSES}>
            <div>
              <H2>{AGENTS_PAGE_CONFIG.gallery.sectionTitle}</H2>
              <P size="lg" className="pb-2 text-muted-foreground">
                {AGENTS_PAGE_CONFIG.gallery.sectionDescription}
              </P>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {AGENTS.map((agent) => {
                const AgentIcon = agent.icon;
                return (
                  <Link key={agent.id} href={agent.href}>
                    <div
                      className={classNames(
                        "group flex h-full cursor-pointer flex-col gap-5 rounded-2xl bg-muted-background p-6",
                        "border border-transparent transition duration-200 ease-out",
                        "hover:border-gray-200",
                        agent.colorClasses.cardHover
                      )}
                    >
                      {/* Icon + title + tags */}
                      <div className="flex items-start gap-4">
                        <div
                          className={classNames(
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                            agent.colorClasses.bg
                          )}
                        >
                          <Icon
                            visual={AgentIcon}
                            className={agent.colorClasses.icon}
                            size="md"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <H3 className="text-foreground">{agent.title}</H3>
                          <div className="flex flex-wrap gap-1.5">
                            {agent.tags.map((tag) => (
                              <span
                                key={tag}
                                className={classNames(
                                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                                  agent.colorClasses.tag
                                )}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <P size="sm" className="text-muted-foreground">
                        {agent.description}
                      </P>

                      {/* CTA */}
                      <div className="mt-auto flex items-center gap-1.5 text-sm font-medium text-foreground opacity-50 transition-all duration-200 group-hover:gap-2 group-hover:opacity-100">
                        Try this agent
                        <Icon visual={ArrowRightIcon} size="xs" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Benefits strip */}
          <div className={classNames(GRID_SECTION_CLASSES, "mt-8")}>
            <H2>Why agents built on Dust?</H2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {AGENTS_PAGE_CONFIG.benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-3 rounded-2xl bg-muted-background p-6"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100">
                    <Icon
                      visual={BENEFIT_ICONS[index]}
                      className="text-primary-600"
                      size="sm"
                    />
                  </div>
                  <H4 className="text-foreground">{benefit.title}</H4>
                  <P size="sm" className="text-muted-foreground">
                    {benefit.description}
                  </P>
                </div>
              ))}
            </div>
          </div>

          {/* Trusted by */}
          <TrustedBy />

          {/* Footer CTA */}
          <div className={classNames(GRID_SECTION_CLASSES, "mt-8")}>
            <div className="flex flex-col items-center gap-6 rounded-2xl bg-muted-background p-12 text-center">
              <H2>Start working smarter today</H2>
              <P size="lg" className="max-w-xl text-muted-foreground">
                Get started for free. No credit card required.
              </P>
              <div className="flex flex-col gap-4 xs:flex-row sm:flex-row">
                <UTMButton
                  variant="highlight"
                  size="md"
                  label="Get started for free"
                  href="/home/pricing"
                  icon={RocketIcon}
                />
                <UTMButton
                  href="/home/contact"
                  variant="outline"
                  size="md"
                  label="Talk to sales"
                />
              </div>
            </div>
          </div>
        </Grid>
      </div>
    </>
  );
}

AgentsGallery.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
