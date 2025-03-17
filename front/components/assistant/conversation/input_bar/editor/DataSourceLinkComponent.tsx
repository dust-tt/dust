import { Chip, FolderIcon } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import type { ConnectorProvider } from "@app/types";

export const DataSourceLinkComponent = ({ node }: { node: { attrs: any } }) => {
  const { title, provider } = node.attrs;

  const IconComponent = provider
    ? CONNECTOR_CONFIGURATIONS[provider as ConnectorProvider].getLogoComponent()
    : FolderIcon;

  return (
    <NodeViewWrapper className="inline-flex">
      <Chip
        label={title}
        icon={IconComponent}
        className="flex items-center border bg-white dark:bg-slate-950"
      />
    </NodeViewWrapper>
  );
};
