import { RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useState } from "react";

import type { ToolConfig } from "@app/components/home/content/Tools/toolsConfig";
import {
  AGENT_ACTION_TOOLS,
  DATA_SOURCE_TOOLS,
} from "@app/components/home/content/Tools/toolsConfig";
import { Grid, H1, H2, H3, P } from "@app/components/home/ContentComponents";
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

const GRID_SECTION_CLASSES = classNames(
  "flex flex-col gap-8",
  "col-span-12",
  "lg:col-span-11 lg:col-start-2",
  "xl:col-span-11 xl:col-start-2",
  "2xl:col-start-3 2xl:col-span-10"
);

type TabType = "data-sources" | "agent-actions";

interface ToolCardProps {
  tool: ToolConfig;
}

function ToolCard({ tool }: ToolCardProps) {
  return (
    <Link href={`/home/tools/${tool.slug}`}>
      <div
        className={classNames(
          "group flex h-full cursor-pointer flex-col gap-4 rounded-2xl bg-muted-background p-6",
          "border border-transparent transition duration-200 ease-out",
          "hover:border-highlight-200 hover:shadow-sm"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm">
            {tool.logoPath && (
              <img
                src={tool.logoPath}
                alt={`${tool.name} logo`}
                width={40}
                height={40}
                className="h-full w-full object-contain p-1"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                }}
              />
            )}
          </div>
          <div>
            <H3 className="text-foreground">{tool.name}</H3>
            <span className="text-xs text-muted-foreground">
              {tool.category}
            </span>
          </div>
        </div>
        <P size="sm" className="text-muted-foreground">
          {tool.description}
        </P>
        <div className="mt-auto flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-all duration-200 group-hover:text-highlight">
          See agent examples →
        </div>
      </div>
    </Link>
  );
}

export default function ToolsHub() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("data-sources");

  const currentTools =
    activeTab === "data-sources" ? DATA_SOURCE_TOOLS : AGENT_ACTION_TOOLS;

  return (
    <>
      <PageMetadata
        title="Integrations & Tools — Connect your stack to Dust AI agents"
        description="Connect 35+ tools to Dust. Sync data sources like Notion, Salesforce, and Google Drive, or give agents the ability to act via Slack, Gmail, Jira, and more."
        pathname={router.asPath}
      />
      <div className="container flex w-full flex-col gap-16 px-2 py-2 pb-12">
        {/* Hero */}
        <div className="flex flex-col items-center gap-6 pt-12 text-center">
          <H1 className="text-center">
            Connect your tools.
            <br />
            Build smarter agents.
          </H1>
          <P size="lg" className="max-w-2xl text-center text-muted-foreground">
            Dust connects to 35+ tools — from knowledge bases to CRMs to
            communication platforms. Sync your data or give agents the ability
            to take action.
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

        <Grid>
          <div className={GRID_SECTION_CLASSES}>
            {/* Tabs */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1 self-start rounded-xl bg-muted-background p-1">
                <button
                  onClick={() => setActiveTab("data-sources")}
                  className={classNames(
                    "rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
                    activeTab === "data-sources"
                      ? "bg-white text-highlight shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Data Sources
                  <span
                    className={classNames(
                      "ml-2 rounded-full px-2 py-0.5 text-xs",
                      activeTab === "data-sources"
                        ? "bg-highlight-100 text-highlight-600"
                        : "bg-primary-100 text-primary-600"
                    )}
                  >
                    {DATA_SOURCE_TOOLS.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("agent-actions")}
                  className={classNames(
                    "rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
                    activeTab === "agent-actions"
                      ? "bg-white text-highlight shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Agent Actions
                  <span
                    className={classNames(
                      "ml-2 rounded-full px-2 py-0.5 text-xs",
                      activeTab === "agent-actions"
                        ? "bg-highlight-100 text-highlight-600"
                        : "bg-primary-100 text-primary-600"
                    )}
                  >
                    {AGENT_ACTION_TOOLS.length}
                  </span>
                </button>
              </div>
              <P size="sm" className="text-muted-foreground">
                {activeTab === "data-sources"
                  ? "Data sources auto-sync your content so agents can search and reference it."
                  : "Agent actions let your agents actively read, write, and interact with external tools."}
              </P>
            </div>

            {/* Tool grid */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {currentTools.map((tool) => (
                <ToolCard key={tool.slug} tool={tool} />
              ))}
            </div>
          </div>

          {/* Footer CTA */}
          <div className={classNames(GRID_SECTION_CLASSES, "mt-8")}>
            <div className="flex flex-col items-center gap-6 rounded-2xl bg-muted-background p-12 text-center">
              <H2>Don&apos;t see your tool?</H2>
              <P size="lg" className="max-w-xl text-muted-foreground">
                Dust integrates with hundreds more tools via API and custom
                connectors. Talk to us about your stack.
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

ToolsHub.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
