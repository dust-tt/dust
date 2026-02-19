import { ArrowLeftIcon, Icon, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { AGENTS } from "@app/components/home/content/Agents/agentsConfig";
import { Grid, H1, H3, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import UTMButton from "@app/components/UTMButton";
import { classNames } from "@app/lib/utils";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

const AGENT_ID = "sop-generator";

export default function SopGeneratorPage() {
  const router = useRouter();
  const agent = AGENTS.find((a) => a.id === AGENT_ID);

  if (!agent) {
    return null;
  }

  const AgentIcon = agent.icon;

  return (
    <>
      <PageMetadata
        title={agent.seo.title}
        description={agent.seo.description}
        pathname={router.asPath}
      />
      <div className="container flex w-full flex-col gap-16 px-2 py-2 pb-12">
        {/* Back link */}
        <div className="pt-8">
          <Link
            href="/home/agents"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icon visual={ArrowLeftIcon} size="xs" />
            All AI agents
          </Link>
        </div>

        <Grid>
          <div
            className={classNames(
              "col-span-12 flex flex-col gap-8",
              "lg:col-span-8 lg:col-start-1",
              "xl:col-span-8 xl:col-start-1"
            )}
          >
            {/* Hero */}
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <div
                  className={classNames(
                    "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl",
                    agent.colorClasses.bg
                  )}
                >
                  <Icon
                    visual={AgentIcon}
                    className={agent.colorClasses.icon}
                    size="lg"
                  />
                </div>
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

              <H1 mono className="text-4xl font-medium md:text-5xl lg:text-6xl">
                {agent.title}
              </H1>

              <P size="lg" className="text-muted-foreground">
                {agent.description}
              </P>

              <div className="flex flex-col gap-4 xs:flex-row">
                <UTMButton
                  variant="highlight"
                  size="md"
                  label="Try this agent"
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

            {/* Placeholder content — to be designed */}
            <div className="flex flex-col gap-6 rounded-2xl bg-muted-background p-8">
              <H3 className="text-muted-foreground">
                Page content coming soon
              </H3>
              <P size="sm" className="text-muted-foreground">
                This page is being designed. Check back soon for a full
                walkthrough of this agent.
              </P>
            </div>
          </div>
        </Grid>
      </div>
    </>
  );
}

SopGeneratorPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
