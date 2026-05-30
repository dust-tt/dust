import { ToolChip } from "@app/components/editor/extensions/skill_builder/ToolChip";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type { AttachedKnowledgeFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getSkillIcon } from "@app/lib/skill";
import { extractSkillTags } from "@app/lib/skills/format";
import { extractToolTags } from "@app/lib/tools/format";
import { AttachmentChip, Chip, cn, DocumentIcon } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface SkillBuilderInstructionsReferenceSummaryProps {
  attachedKnowledge?: AttachedKnowledgeFormData[];
  instructions: string;
  tools: BuilderAction[];
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seenIds = new Set<string>();

  return items.filter((item) => {
    if (seenIds.has(item.id)) {
      return false;
    }

    seenIds.add(item.id);
    return true;
  });
}

export function SkillBuilderInstructionsReferenceSummary({
  attachedKnowledge,
  instructions,
  tools,
}: SkillBuilderInstructionsReferenceSummaryProps) {
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

  const knowledgeReferences = useMemo(
    () =>
      dedupeById(
        (attachedKnowledge ?? []).map((item) => ({
          id: `${item.dataSourceViewId}:${item.nodeId}`,
          title: item.title,
        }))
      ),
    [attachedKnowledge]
  );

  const skillReferences = useMemo(
    () =>
      dedupeById(
        extractSkillTags(instructions).map((skill) => ({
          icon: skill.icon,
          id: skill.id,
          title: skill.name,
        }))
      ),
    [instructions]
  );

  const inlineToolReferences = useMemo(
    () =>
      dedupeById(
        extractToolTags(instructions).map((tool) => {
          const view = isMCPServerViewsLoading
            ? null
            : (mcpServerViews.find((v) => v.sId === tool.id) ?? null);

          return {
            icon: view?.server.icon ?? tool.icon,
            id: tool.id,
            title: view ? getMcpServerViewDisplayName(view) : tool.name,
          };
        })
      ),
    [instructions, isMCPServerViewsLoading, mcpServerViews]
  );

  const selectedToolReferences = useMemo(() => {
    if (isMCPServerViewsLoading) {
      return tools.map((tool) => ({
        icon: null,
        id: tool.configuration.mcpServerViewId,
        title: tool.name,
      }));
    }

    return tools.map((tool) => {
      const view = mcpServerViews.find(
        (v) => v.sId === tool.configuration.mcpServerViewId
      );

      return {
        icon: view?.server.icon ?? null,
        id: tool.configuration.mcpServerViewId,
        title: view ? getMcpServerViewDisplayName(view, tool) : tool.name,
      };
    });
  }, [isMCPServerViewsLoading, mcpServerViews, tools]);

  const toolReferences = dedupeById([
    ...inlineToolReferences,
    ...selectedToolReferences,
  ]);

  const hasReferences =
    knowledgeReferences.length > 0 ||
    skillReferences.length > 0 ||
    toolReferences.length > 0;

  if (!hasReferences) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute inset-x-px bottom-px z-10 max-h-40 overflow-y-auto rounded-b-xl border-t px-3 pb-3 pt-3",
        "border-border/70 bg-background/75 shadow-[0_-12px_24px_rgba(0,0,0,0.08)] backdrop-blur-md",
        "dark:border-border-night/70 dark:bg-background-night/75"
      )}
    >
      <div className="mb-2 text-sm font-semibold text-foreground dark:text-foreground-night">
        Capabilities and knowledge
      </div>
      <div className="flex flex-wrap gap-2">
        {skillReferences.map((skill) => (
          <Chip
            key={skill.id}
            label={skill.title}
            icon={getSkillIcon(skill.icon)}
            color="white"
            size="xs"
          />
        ))}
        {knowledgeReferences.map((item) => (
          <AttachmentChip
            key={item.id}
            label={item.title}
            icon={{ visual: DocumentIcon }}
            color="white"
            size="xs"
          />
        ))}
        {toolReferences.map((tool) => (
          <ToolChip
            key={tool.id}
            title={tool.title}
            toolIcon={tool.icon}
            color="white"
          />
        ))}
      </div>
    </div>
  );
}
