import type { PluginWorkspaceResource } from "@dust-tt/types";
import React, { useState } from "react";

import { RunPluginDialog } from "@app/components/poke/plugins/RunPluginDialog";
import {
  PokeCard,
  PokeCardDescription,
  PokeCardHeader,
  PokeCardTitle,
} from "@app/components/poke/shadcn/ui/card";
import type { PluginListItem } from "@app/lib/api/poke/types";
import { usePokeListPluginForResourceType } from "@app/poke/swr/plugins";

interface PluginCardProps {
  onClick: () => void;
  plugin: PluginListItem;
}

function PluginCard({ onClick, plugin }: PluginCardProps) {
  return (
    <PokeCard
      className="flex w-44 cursor-pointer hover:bg-gray-100"
      onClick={onClick}
    >
      <PokeCardHeader className="space-y-1.5 p-2">
        <PokeCardTitle className="text-sm font-medium">
          {plugin.name}
        </PokeCardTitle>
        <PokeCardDescription className="text-xs">
          {plugin.description}
        </PokeCardDescription>
      </PokeCardHeader>
    </PokeCard>
  );
}

interface PluginListProps {
  resourceType: string;
  workspaceResource?: PluginWorkspaceResource;
}

export function PluginList({
  resourceType,
  workspaceResource,
}: PluginListProps) {
  const { plugins } = usePokeListPluginForResourceType({ resourceType });
  const [selectedPlugin, setSelectedPlugin] = useState<PluginListItem | null>(
    null
  );

  const handlePluginSelect = (plugin: PluginListItem) => {
    setSelectedPlugin(plugin);
  };

  const handleDialogClose = () => {
    setSelectedPlugin(null);
  };

  return (
    <div className="border-material-200 flex min-h-48 flex-col rounded-lg border bg-slate-100">
      <div className="flex justify-between gap-3 rounded-t-lg bg-slate-300 p-4">
        <h2 className="text-md font-bold">Plugins :</h2>
      </div>
      <div className="flex w-full flex-row items-start gap-3 p-4">
        {plugins.map((plugin) => (
          <PluginCard
            key={plugin.id}
            plugin={plugin}
            onClick={() => handlePluginSelect(plugin)}
          />
        ))}
      </div>
      {selectedPlugin && (
        <RunPluginDialog
          plugin={selectedPlugin}
          workspaceResource={workspaceResource}
          onClose={handleDialogClose}
        />
      )}
    </div>
  );
}
