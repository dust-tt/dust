import { ToolChip } from "@app/components/editor/extensions/skill_builder/ToolChip";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type {
  AttachedKnowledgeFormData,
  ReferencedSkillFormData,
} from "@app/components/skill_builder/SkillBuilderFormContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import { getSkillIcon } from "@app/lib/skill";
import { extractToolTags } from "@app/lib/tools/format";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { AttachmentChip, Chip, cn, DocumentIcon } from "@dust-tt/sparkle";
import type { Ref } from "react";
import { useMemo } from "react";

interface SkillBuilderInstructionsReferenceSummaryProps {
  attachedKnowledge?: AttachedKnowledgeFormData[];
  containerRef?: Ref<HTMLDivElement>;
  hasError: boolean;
  instructions: string;
  onReferenceClick: (target: ReferenceSummaryTarget) => void;
  referencedSkills: ReferencedSkillFormData[];
  tools: BuilderAction[];
}

export type ReferenceSummaryTarget =
  | { id: string; kind: "knowledge" }
  | { id: string; kind: "skill" }
  | { id: string; kind: "tool" };

type ReferenceSummaryItem = ReferenceSummaryTarget & {
  dataSourceViewId?: string;
  icon?: string | null;
  node?: AttachedKnowledgeFormData["node"];
  nodeId?: string;
  spaceId?: string;
  title: string;
};

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

function compareReferenceSummaryItems(
  a: ReferenceSummaryItem,
  b: ReferenceSummaryItem
) {
  return (
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) ||
    a.kind.localeCompare(b.kind) ||
    a.id.localeCompare(b.id)
  );
}

function renderReferenceSummaryItem({
  item,
  onReferenceClick,
}: {
  item: ReferenceSummaryItem;
  onReferenceClick: (target: ReferenceSummaryTarget) => void;
}) {
  const handleClick = () => onReferenceClick({ id: item.id, kind: item.kind });

  switch (item.kind) {
    case "knowledge":
      return (
        <KnowledgeReferenceSummaryItem
          key={`${item.kind}:${item.id}`}
          item={item}
          onClick={handleClick}
        />
      );
    case "skill":
      return (
        <Chip
          key={`${item.kind}:${item.id}`}
          label={item.title}
          icon={getSkillIcon(item.icon ?? null)}
          color="white"
          size="xs"
          onClick={handleClick}
        />
      );
    case "tool":
      return (
        <ToolChip
          key={`${item.kind}:${item.id}`}
          title={item.title}
          toolIcon={item.icon ?? null}
          color="white"
          onClick={handleClick}
        />
      );
    default:
      return assertNever(item);
  }
}

function KnowledgeReferenceSummaryItem({
  item,
  onClick,
}: {
  item: ReferenceSummaryItem & { kind: "knowledge" };
  onClick: () => void;
}) {
  if (item.node) {
    if (
      isWebsite(item.node.dataSourceView.dataSource) ||
      isFolder(item.node.dataSourceView.dataSource)
    ) {
      return (
        <AttachmentChip
          label={item.title}
          icon={{ visual: getVisualForDataSourceViewContentNode(item.node) }}
          color="white"
          size="xs"
          onClick={onClick}
        />
      );
    }

    return (
      <AttachmentChip
        label={item.title}
        doubleIcon={{
          size: "sm",
          mainIcon: getVisualForDataSourceViewContentNode(item.node),
          secondaryIcon: getConnectorProviderLogoWithFallback({
            provider: item.node.dataSourceView.dataSource.connectorProvider,
          }),
        }}
        color="white"
        size="xs"
        onClick={onClick}
      />
    );
  }

  return (
    <AttachmentChip
      label={item.title}
      icon={{ visual: DocumentIcon }}
      color="white"
      size="xs"
      onClick={onClick}
    />
  );
}

export function SkillBuilderInstructionsReferenceSummary({
  attachedKnowledge,
  containerRef,
  hasError,
  instructions,
  onReferenceClick,
  referencedSkills,
  tools,
}: SkillBuilderInstructionsReferenceSummaryProps) {
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

  const knowledgeReferences = useMemo(
    () =>
      dedupeById(
        (attachedKnowledge ?? []).map((item) => ({
          dataSourceViewId: item.dataSourceViewId,
          id: `${item.dataSourceViewId}:${item.nodeId}`,
          node: item.node,
          nodeId: item.nodeId,
          spaceId: item.spaceId,
          title: item.title,
        }))
      ),
    [attachedKnowledge]
  );

  const skillReferences = useMemo(
    () =>
      dedupeById(
        referencedSkills.map((skill) => ({
          icon: skill.icon,
          id: skill.id,
          title: skill.name,
        }))
      ),
    [referencedSkills]
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
    return tools.map((tool) => ({
      icon: null,
      id: tool.configuration.mcpServerViewId,
      title: tool.name,
    }));
  }, [tools]);

  const toolReferences = useMemo(
    () => dedupeById([...selectedToolReferences, ...inlineToolReferences]),
    [inlineToolReferences, selectedToolReferences]
  );

  const referenceItems = useMemo(
    () =>
      [
        ...knowledgeReferences.map(
          (item): ReferenceSummaryItem => ({
            ...item,
            kind: "knowledge",
          })
        ),
        ...skillReferences.map(
          (skill): ReferenceSummaryItem => ({
            ...skill,
            kind: "skill",
          })
        ),
        ...toolReferences.map(
          (tool): ReferenceSummaryItem => ({
            ...tool,
            kind: "tool",
          })
        ),
      ].toSorted(compareReferenceSummaryItems),
    [knowledgeReferences, skillReferences, toolReferences]
  );

  if (referenceItems.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-x-0 bottom-0 z-10 max-h-40 overflow-y-auto rounded-b-xl border-x border-b bg-background px-3 pb-3 pt-3",
        "dark:bg-background-night",
        hasError
          ? [
              "border-border-warning/30 group-focus-within:border-border-warning",
              "dark:border-border-warning-night/60 dark:group-focus-within:border-border-warning-night",
            ]
          : [
              "border-border group-focus-within:border-highlight-300",
              "dark:border-border-night dark:group-focus-within:border-highlight-300-night",
            ]
      )}
    >
      <div className="mb-2 text-sm font-medium text-foreground dark:text-foreground-night">
        Capabilities and knowledge
      </div>
      <div className="flex flex-wrap gap-2">
        {referenceItems.map((item) =>
          renderReferenceSummaryItem({ item, onReferenceClick })
        )}
      </div>
    </div>
  );
}
