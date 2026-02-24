import { RocketIcon } from "@dust-tt/sparkle";
import type { GetStaticPaths, GetStaticProps } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useState } from "react";

import type {
  AgentExample,
  ToolConfig,
} from "@app/components/home/content/Tools/toolsConfig";
import {
  getToolBySlug,
  TOOLS,
} from "@app/components/home/content/Tools/toolsConfig";
import {
  Grid,
  H1,
  H2,
  H3,
  H4,
  P,
} from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import UTMButton from "@app/components/UTMButton";
import { classNames } from "@app/lib/utils";

interface ToolPageProps {
  gtmTrackingId: string | null;
  tool: ToolConfig;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = TOOLS.map((tool) => ({
    params: { tool: tool.slug },
  }));
  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps<ToolPageProps> = async ({
  params,
}) => {
  const slug = params?.tool;
  if (typeof slug !== "string") {
    return { notFound: true };
  }

  const tool = getToolBySlug(slug);
  if (!tool) {
    return { notFound: true };
  }

  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      tool,
    },
  };
};

const GRID_SECTION_CLASSES = classNames(
  "flex flex-col gap-8",
  "col-span-12",
  "lg:col-span-11 lg:col-start-2",
  "xl:col-span-11 xl:col-start-2",
  "2xl:col-start-3 2xl:col-span-10"
);

function TypeBadge({ type }: { type: ToolConfig["type"] }) {
  if (type === "both") {
    return (
      <div className="flex gap-2">
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
          Data Source
        </span>
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
          Agent Action
        </span>
      </div>
    );
  }
  if (type === "data-source") {
    return (
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
        Data Source
      </span>
    );
  }
  return (
    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
      Agent Action
    </span>
  );
}

// O(n) Map for constant-time slug → ToolConfig lookup (GEN7)
const TOOL_BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]));

interface AgentCardProps {
  agent: AgentExample;
  index: number;
}

function AgentCard({ agent, index }: AgentCardProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(agent.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={classNames(
        "flex h-full flex-col gap-4 rounded-2xl bg-muted-background p-6",
        "border border-transparent",
        "group transition duration-200 ease-out hover:bg-primary-50 hover:border-highlight-200 hover:shadow-sm"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <H3 className="text-foreground">{agent.name}</H3>
        <span className="shrink-0 rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-600">
          #{index + 1}
        </span>
      </div>

      <P size="sm" className="text-muted-foreground">
        {agent.description}
      </P>

      <div className="flex flex-wrap gap-1.5">
        {agent.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
          >
            {tag}
          </span>
        ))}
      </div>

      {agent.relatedTools && agent.relatedTools.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-separator pt-3">
          <span className="text-xs text-muted-foreground">
            Also works with:
          </span>
          {agent.relatedTools.map((slug) => {
            const relTool = TOOL_BY_SLUG.get(slug);
            if (!relTool) {
              return null;
            }
            return (
              <div
                key={slug}
                title={relTool.name}
                className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md bg-white shadow-sm"
              >
                <img
                  src={relTool.logoPath}
                  alt={relTool.name}
                  width={20}
                  height={20}
                  className="h-full w-full object-contain p-0.5"
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-auto">
        <button
          onClick={handleCopy}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? "Copied!" : "Copy prompt"}{" "}
          <span className="group-hover:text-highlight">→</span>
        </button>
      </div>
    </div>
  );
}

export default function ToolPage({ tool }: ToolPageProps) {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title={`Build AI agents with ${tool.name} + Dust`}
        description={`Connect ${tool.name} to Dust and build powerful AI agents. ${tool.description} See 3 agent examples with full prompts.`}
        pathname={router.asPath}
      />
      <div className="container flex w-full flex-col gap-16 px-2 py-2 pb-12">
        {/* Hero */}
        <div className="flex flex-col items-center gap-6 pt-12 text-center">
          <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-white shadow-md">
            {tool.logoPath && (
              <img
                src={tool.logoPath}
                alt={`${tool.name} logo`}
                width={64}
                height={64}
                className="h-full w-full object-contain p-2"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                }}
              />
            )}
          </div>

          <TypeBadge type={tool.type} />

          <H1>Build AI agents with {tool.name} + Dust</H1>

          <P size="lg" className="max-w-2xl text-muted-foreground">
            {tool.description}
            {tool.actionDescription && tool.type !== "data-source" && (
              <> {tool.actionDescription}</>
            )}
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
          {/* What you can build */}
          <div className={GRID_SECTION_CLASSES}>
            <div>
              <H2>What you can build with {tool.name}</H2>
              <P size="lg" className="pb-2 text-muted-foreground">
                3 agents you can create in minutes — with prompts ready to use.
              </P>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {tool.agents.map((agent, index) => (
                <AgentCard key={agent.name} agent={agent} index={index} />
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className={classNames(GRID_SECTION_CLASSES, "mt-4")}>
            <H2>How {tool.name} works with Dust</H2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {tool.type !== "agent-action" && (
                <div className="flex flex-col gap-3 rounded-2xl border border-transparent bg-muted-background p-6 transition duration-200 ease-out hover:border-highlight-200 hover:shadow-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600 font-bold text-lg">
                    1
                  </div>
                  <H4 className="text-foreground">Connect {tool.name}</H4>
                  <P size="sm" className="text-muted-foreground">
                    Authorize Dust to access your {tool.name} workspace. Data
                    syncs automatically and stays up to date.
                  </P>
                </div>
              )}
              {tool.type === "agent-action" && (
                <div className="flex flex-col gap-3 rounded-2xl border border-transparent bg-muted-background p-6 transition duration-200 ease-out hover:border-highlight-200 hover:shadow-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600 font-bold text-lg">
                    1
                  </div>
                  <H4 className="text-foreground">Connect {tool.name}</H4>
                  <P size="sm" className="text-muted-foreground">
                    Authorize Dust to interact with {tool.name} on behalf of
                    your agents. Set permissions to control what agents can do.
                  </P>
                </div>
              )}
              <div className="flex flex-col gap-3 rounded-2xl border border-transparent bg-muted-background p-6 transition duration-200 ease-out hover:border-highlight-200 hover:shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600 font-bold text-lg">
                  2
                </div>
                <H4 className="text-foreground">Build your agent</H4>
                <P size="sm" className="text-muted-foreground">
                  Use the prompts above as a starting point. Customize them for
                  your team&apos;s specific workflow and requirements.
                </P>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-transparent bg-muted-background p-6 transition duration-200 ease-out hover:border-highlight-200 hover:shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600 font-bold text-lg">
                  3
                </div>
                <H4 className="text-foreground">Deploy to your team</H4>
                <P size="sm" className="text-muted-foreground">
                  Share the agent across your organization. Track usage and
                  refine prompts as you learn what works best.
                </P>
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          <div className={classNames(GRID_SECTION_CLASSES, "mt-8")}>
            <div className="flex flex-col items-center gap-6 rounded-2xl bg-muted-background p-12 text-center">
              <H2>Ready to build with {tool.name}?</H2>
              <P size="lg" className="max-w-xl text-muted-foreground">
                Connect {tool.name} to Dust and have your first agent running in
                minutes.
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

ToolPage.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
