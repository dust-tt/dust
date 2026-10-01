import {
  InternalActionIcons,
  isCustomResourceIconType,
} from "@app/components/resources/resources_icons";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import {
  ActionCard,
  ActionIcons,
  BookOpen01,
  Hoverable,
} from "@dust-tt/sparkle";
import React from "react";

interface MCPServerCardProps {
  view: MCPServerViewTypeWithLabel;
  isSelected: boolean;
  onClick: () => void;
  onToolInfoClick: () => void;
}

export function MCPServerCard({
  view,
  isSelected,
  onClick,
  onToolInfoClick,
}: MCPServerCardProps) {
  const requirements = getMCPServerRequirements(view);
  const canAdd = requirements.noRequirement ? !isSelected : true;

  const icon = isCustomResourceIconType(view.server.icon)
    ? ActionIcons[view.server.icon]
    : (InternalActionIcons[view.server.icon] ?? BookOpen01);

  // Create a ref to use as portal container for tooltips to prevent click blocking
  const containerRef = React.useRef<HTMLDivElement>(null);

  let description: React.ReactNode | null;
  if (view.server.documentationUrl) {
    description = (
      <>
        {getMcpServerViewDescription(view)} Find documentation{" "}
        <Hoverable
          href={view.server.documentationUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="primary"
          onClick={(e) => e.stopPropagation()}
        >
          here
        </Hoverable>
        .
      </>
    );
  } else {
    description = getMcpServerViewDescription(view);
  }

  return (
    <div ref={containerRef}>
      <ActionCard
        icon={icon}
        label={view.label}
        description={description}
        isSelected={isSelected}
        canAdd={canAdd}
        onClick={onClick}
        cardContainerClassName="h-30"
        mountPortal
        // eslint-disable-next-line react-hooks/refs, @typescript-eslint/prefer-nullish-coalescing
        mountPortalContainer={containerRef.current || undefined}
        footer={{
          label: "Tool Details",
          onClick: onToolInfoClick,
        }}
      />
    </div>
  );
}
