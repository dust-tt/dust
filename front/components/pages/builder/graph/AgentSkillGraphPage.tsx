import { Page, SearchInput, ShapesIcon, Spinner } from "@dust-tt/sparkle";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { useGraphData } from "@app/components/pages/builder/graph/useGraphData";
import { AppWideModeLayout } from "@app/components/sparkle/AppWideModeLayout";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { Head } from "@app/lib/platform";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";

const ForceGraphView = dynamic(
  () =>
    import("@app/components/pages/builder/graph/ForceGraph").then(
      (mod) => mod.ForceGraphView
    ),
  { ssr: false }
);

export function AgentSkillGraphPage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const [search, setSearch] = useState("");

  const { agentConfigurations, isLoading: isAgentsLoading } =
    useUnifiedAgentConfigurations({ workspaceId: owner.sId });

  const {
    skillsWithRelations,
    isSkillsWithRelationsLoading: isSkillsLoading,
  } = useSkillsWithRelations({ owner, status: "active" });

  const graphData = useGraphData(agentConfigurations, skillsWithRelations);
  const isLoading = isAgentsLoading || isSkillsLoading;

  // Track container dimensions.
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    }
  }, []);

  useEffect(() => {
    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [updateDimensions]);

  return (
    <AppWideModeLayout
      subscription={subscription}
      owner={owner}
      navChildren={<AgentSidebarMenu owner={owner} />}
    >
      <Head>
        <title>Dust - Agent & Skill Graph</title>
      </Head>
      <div className="flex w-full flex-col gap-4 pb-4 pt-2 lg:pt-8">
        <Page.Header
          title="Agent & Skill Graph"
          icon={ShapesIcon}
          description="Visualize how agents and skills are connected."
        />
        <div className="flex items-center gap-4">
          <SearchInput
            className="max-w-xs"
            name="graph-search"
            placeholder="Search nodes..."
            value={search}
            onChange={setSearch}
          />
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: "#60a5fa" }}
              />
              <span className="text-slate-400">Agents</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3"
                style={{
                  backgroundColor: "#a78bfa",
                  clipPath:
                    "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                }}
              />
              <span className="text-slate-400">Skills</span>
            </div>
          </div>
        </div>
        <div
          ref={containerRef}
          className="relative h-[calc(100vh-200px)] overflow-hidden rounded-xl"
          style={{ backgroundColor: "#0f172a" }}
        >
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <ForceGraphView
              graphData={graphData}
              searchQuery={search}
              width={dimensions.width}
              height={dimensions.height}
            />
          )}
        </div>
      </div>
    </AppWideModeLayout>
  );
}
