import { createTextDirective } from "@app/components/markdown/directives";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { getVisualForContentNodeType } from "@app/lib/content_nodes";
import type { ContentFragmentNodeData } from "@app/types/content_fragment";
import { AttachmentChip, DoubleIcon } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

export interface AttachmentChipDirectiveBlockProps {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  href?: string;
  onClick?: () => void;
}

export function AttachmentChipDirectiveBlock({
  label,
  icon,
  href,
  onClick,
}: AttachmentChipDirectiveBlockProps) {
  const interactionProps = href
    ? { href, target: "_blank" as const }
    : { onClick };

  return (
    <AttachmentChip
      label={label}
      icon={icon ? { visual: icon, size: "xs" } : undefined}
      color="primary"
      size="xs"
      {...interactionProps}
    />
  );
}

export interface AttachmentChipDirectiveProps {
  id: string;
  icon: string | null;
  name: string;
}

export type AttachmentChipDirectiveName = "skill" | "tool";

export function createAttachmentChipDirective(
  directiveName: AttachmentChipDirectiveName
) {
  return createTextDirective(directiveName, (name, { sId, icon }) => ({
    id: sId,
    icon,
    name,
  }));
}

export interface KnowledgeChipDirectiveProps {
  id: string;
  title: string;
  space?: string;
  dsv?: string;
}

export function getKnowledgeIcon(nodeData: ContentFragmentNodeData | null) {
  if (!nodeData) {
    return undefined;
  }

  const { nodeType, provider } = nodeData;
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
