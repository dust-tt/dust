import { ToolChip } from "@app/components/editor/extensions/skill_builder/ToolChip";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type { AttachedKnowledgeFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getSkillIcon } from "@app/lib/skill";
import { extractSkillReferenceTags } from "@app/lib/skills/format";
import { extractToolTags } from "@app/lib/tools/format";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { AttachmentChip, Button, ChevronDown, ChevronUp, Chip, cn, File02 } from "@dust-tt/sparkle";
import type { Ref, RefObject } from "react";
import { useEffect, useMemo, useState } from "react";

interface SkillBuilderInstructionsReferenceSummaryProps {
  attachedKnowledge?: AttachedKnowledgeFormData[];
  containerRef?: RefObject<HTMLDivElement>;
  hasError: boolean;
  instructions: string;
  onReferenceClick: (target: ReferenceSummaryItem) => void;
  tools: BuilderAction[];
}

export type ReferenceSummaryItem =
  | {
      id: string;
      kind: "knowledge";
      title: string;
    }
  | {
      icon: string | null;
      id: string;
      kind: "skill";
      title: string;
    }
  | {
      icon: string | null;
      id: string;
      kind: "tool";
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
  onReferenceClick: (target: ReferenceSummaryItem) => void;
}) {
  switch (item.kind) {
    case "knowledge":
      return (
        <AttachmentChip
          key={`${item.kind}:${item.id}`}
          label={item.title}
          icon={{ visual: File02 }}
          color="primary"
          size="xs"
          className="text-xs"
          onClick={() => onReferenceClick(item)}
        />
      );
    case "skill":
      return (
        <Chip
          key={`${item.kind}:${item.id}`}
          label={item.title}
          icon={getSkillIcon(item.icon)}
          color="primary"
          size="xs"
          onClick={() => onReferenceClick(item)}
        />
      );
    case "tool":
      return (
        <ToolChip
          key={`${item.kind}:${item.id}`}
          title={item.title}
          toolIcon={item.icon}
          color="primary"
          onClick={() => onReferenceClick(item)}
        />
      );
    default:
      return assertNever(item);
  }
}

export function SkillBuilderInstructionsReferenceSummary({
  attachedKnowledge,
  containerRef,
  hasError,
  instructions,
  onReferenceClick,
  tools,
}: SkillBuilderInstructionsReferenceSummaryProps) {
  const [isOverflow, setIsOverflow] = useState(false);
  const [isExpand, setIsExpand] = useState(false);
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

  // Derived from the instructions (like inline tool references below) so the
  // chips stay in sync when the content is replaced without editor updates,
  // e.g. when restoring a previous version.
  const skillReferences = useMemo(
    () =>
      dedupeById(
        extractSkillReferenceTags(instructions).map((skill) => ({
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


  useEffect(() => {
    // check everytime reference items number changes if the content is overflowing or not
    if (containerRef?.current) {
      console.log("overflow", containerRef.current.scrollHeight, containerRef.current.offsetHeight);
      setIsOverflow(containerRef.current.scrollHeight > containerRef.current.offsetHeight);
    }
  }, [referenceItems.length]);

 // have min height to always keep space to show references so there is less content shift.
  return (
    <div className="min-h-6"> 
    {
      referenceItems.length > 0 &&  <div
      ref={containerRef}
      className={cn(!isExpand &&
        "overflow-y-hidden max-h-15",
        hasError
          ? [
              "border-border-warning/30 group-focus-within:border-border-warning",
              "",
            ]
          : ["border-border group-focus-within:border-highlight-300", ""]
      )}
    >
      <div className="flex flex-wrap gap-2">
        {referenceItems.map((item) =>
          renderReferenceSummaryItem({ item, onReferenceClick })
        )} 
      </div> 
      </div> 
      }
            {
        isOverflow && 
         <div className="flex justify-end">
      <Button label={`See ${isExpand ? "less" : "more"}`} onClick={() => setIsExpand((prev) => !prev)} icon={isExpand ? ChevronUp : ChevronDown} variant="ghost-secondary" size="xs" />
      </div>
      }
    </div>
  )
}
