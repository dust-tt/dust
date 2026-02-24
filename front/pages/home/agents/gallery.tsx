import {
  ArrowRightIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
  Icon,
} from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useState } from "react";

import type { GalleryCategory } from "@app/components/home/content/Agents/agentsGalleryConfig";
import {
  GALLERY_AGENTS,
  GALLERY_CATEGORIES,
} from "@app/components/home/content/Agents/agentsGalleryConfig";
import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import { Grid, H3, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
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

const PAGE_SIZE = 15;

export default function AgentsGalleryPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<GalleryCategory>("All");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filteredAgents =
    activeCategory === "All"
      ? GALLERY_AGENTS
      : GALLERY_AGENTS.filter((a) => a.category === activeCategory);

  const visibleAgents = filteredAgents.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAgents.length;

  function handleCategoryChange(category: GalleryCategory) {
    setActiveCategory(category);
    setVisibleCount(PAGE_SIZE);
  }

  function handleCopyPrompt(agentId: string, prompt: string) {
    void navigator.clipboard.writeText(prompt).then(() => {
      setCopiedId(agentId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <>
      <PageMetadata
        title="AI Agents Gallery — 50 Ready-to-Deploy Templates | Dust"
        description="Browse 50 ready-to-deploy AI agent templates for Sales, Marketing, Growth, Research, CS, and SEO. Start building on Dust in minutes."
        pathname={router.asPath}
      />
      <div className="container flex w-full flex-col gap-16 px-2 py-2 pb-12">
        {/* Hero */}
        <HeaderContentBlock
          uptitle="AI Agents Gallery"
          title={<>50 ready-to-deploy AI agent templates</>}
          subtitle="Browse by category and start building on Dust in minutes."
          hasCTA={true}
        />

        <Grid>
          <div className={GRID_SECTION_CLASSES}>
            {/* Category filters */}
            <div className="flex flex-wrap gap-2">
              {GALLERY_CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => handleCategoryChange(category)}
                  className={classNames(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150",
                    activeCategory === category
                      ? "bg-primary-600 text-white"
                      : "bg-muted-background text-muted-foreground hover:bg-gray-100"
                  )}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Agent grid */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {visibleAgents.map((agent) => {
                const AgentIcon = agent.icon;
                const isCopied = copiedId === agent.id;
                return (
                  <div
                    key={agent.id}
                    className={classNames(
                      "flex h-full flex-col gap-5 rounded-2xl bg-muted-background p-6",
                      "border border-transparent transition duration-200 ease-out",
                      "hover:border-gray-200",
                      agent.colorClasses.cardHover
                    )}
                  >
                    {/* Icon + title + category badge */}
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
                        <span
                          className={classNames(
                            "w-fit rounded-full px-2.5 py-0.5 text-xs font-medium",
                            agent.colorClasses.tag
                          )}
                        >
                          {agent.category}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <P size="sm" className="text-muted-foreground">
                      {agent.description}
                    </P>

                    {/* Recommended tools */}
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Recommended tools to sync
                      </span>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {agent.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-auto flex items-center justify-between">
                      <Link
                        href="/home/pricing"
                        className="group flex items-center gap-1.5 text-sm font-medium text-foreground opacity-50 transition-all duration-200 hover:gap-2 hover:opacity-100"
                      >
                        Try this agent
                        <Icon visual={ArrowRightIcon} size="xs" />
                      </Link>

                      <button
                        onClick={() => handleCopyPrompt(agent.id, agent.prompt)}
                        className={classNames(
                          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
                          isCopied
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        )}
                      >
                        <Icon
                          visual={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                          size="xs"
                        />
                        {isCopied ? "Copied!" : "Copy prompt"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="rounded-full bg-muted-background px-6 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-gray-100"
                >
                  Load more ({filteredAgents.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </div>
        </Grid>
      </div>
    </>
  );
}

AgentsGalleryPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
