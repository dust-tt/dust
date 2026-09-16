import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { getVisualForContentNodeType } from "@app/lib/content_nodes";
import type { ContentFragmentNodeData } from "@app/types/content_fragment";
import { AttachmentChip, DoubleIcon } from "@dust-tt/sparkle";
import { visit } from "unist-util-visit";

export interface KnowledgeChipDirectiveProps {
  id: string;
  title: string;
  space?: string;
  dsv?: string;
}

interface KnowledgeChipDirectiveBlockProps {
  title: string;
  sourceUrl: string | null;
  nodeData: ContentFragmentNodeData | null;
}

export function KnowledgeChipDirectiveBlock({
  title,
  sourceUrl,
  nodeData,
}: KnowledgeChipDirectiveBlockProps) {
  const icon = nodeData ? getKnowledgeIcon(nodeData) : undefined;

  if (sourceUrl) {
    return (
      <AttachmentChip
        label={title}
        icon={icon ? { visual: icon } : undefined}
        href={sourceUrl}
        target="_blank"
        color="primary"
        size="xs"
      />
    );
  }

  return (
    <AttachmentChip
      label={title}
      icon={icon ? { visual: icon } : undefined}
      color="primary"
      size="xs"
    />
  );
}

function getKnowledgeIcon({ nodeType, provider }: ContentFragmentNodeData) {
  const mainIcon = getVisualForContentNodeType(nodeType);

  if (!provider || provider === "webcrawler") {
    return mainIcon;
  }

  return () => (
    <DoubleIcon
      size="sm"
      mainIcon={mainIcon}
      secondaryIcon={getConnectorProviderLogoWithFallback({ provider })}
    />
  );
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
