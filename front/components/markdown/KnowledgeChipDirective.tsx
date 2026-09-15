import { KnowledgeChip } from "@app/components/editor/extensions/skill_builder/KnowledgeChip";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useSpaceDataSourceView } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { AttachmentChip } from "@dust-tt/sparkle";
import { visit } from "unist-util-visit";

export interface KnowledgeChipDirectiveProps {
  id: string;
  title: string;
  space?: string;
  dsv?: string;
}

interface KnowledgeChipDirectiveBlockProps {
  owner: LightWorkspaceType;
  nodeId: string;
  title: string;
  spaceId: string | null;
  dataSourceViewId: string | null;
}

// Chip rendered for an inline <knowledge> tag in a user message. The tag only
// carries ids and a title, so the content node is fetched to display the same
// icon as the skill builder's knowledge chip. While loading — or when the
// viewer cannot access the node — the chip degrades to the title alone.
export function KnowledgeChipDirectiveBlock({
  owner,
  nodeId,
  title,
  spaceId,
  dataSourceViewId,
}: KnowledgeChipDirectiveBlockProps) {
  const canFetch = Boolean(spaceId && dataSourceViewId);

  const { dataSourceView } = useSpaceDataSourceView({
    dataSourceViewId,
    disabled: !canFetch,
    owner,
    spaceId,
  });

  const { nodes } = useDataSourceViewContentNodes({
    owner,
    dataSourceView,
    internalIds: [nodeId],
    viewType: "all",
    disabled: !canFetch || !dataSourceView,
  });

  const node = nodes.find((n) => n.internalId === nodeId);
  if (!node) {
    return <AttachmentChip label={title} color="primary" size="xs" />;
  }

  return <KnowledgeChip node={node} title={title} />;
}

export function knowledgeChipDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "knowledge" && node.children[0]) {
        const data = node.data ?? {};
        // `unist-util-visit` directive transforms are expected to annotate the
        // current node in place so mdast-util-to-hast can consume `node.data`.
        node.data = data;
        data.hName = "knowledge";
        data.hProperties = {
          id: node.attributes.id,
          title: node.children[0].value,
          space: node.attributes.space,
          dsv: node.attributes.dsv,
        };
      }
    });
  };
}
