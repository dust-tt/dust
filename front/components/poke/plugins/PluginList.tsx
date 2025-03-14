import { ScrollArea, Tooltip } from "@dust-tt/sparkle";
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
import type { PluginResourceTarget } from "@app/types";

interface PluginCardProps {
  onClick: () => void;
  plugin: PluginListItem;
}

function PluginCard({ onClick, plugin }: PluginCardProps) {
  return (
    <PokeCard
      className="flex h-20 w-44 cursor-pointer hover:bg-gray-100"
      onClick={onClick}
    >
      <PokeCardHeader className="flex space-y-1.5 overflow-hidden p-2 text-left">
        <PokeCardTitle className="text-sm font-medium">
          {plugin.name}
        </PokeCardTitle>
        <PokeCardDescription className="overflow-hidden truncate whitespace-normal text-xs">
          {plugin.description}
        </PokeCardDescription>
      </PokeCardHeader>
    </PokeCard>
  );
}

interface PluginListProps {
  pluginResourceTarget: PluginResourceTarget;
}

export function PluginList({ pluginResourceTarget }: PluginListProps) {
  const { plugins } = usePokeListPluginForResourceType({
    pluginResourceTarget,
  });
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
    <div className="border-material-200 flex min-h-48 flex-col rounded-lg border bg-slate-100 dark:bg-slate-100-night">
      <div className="flex justify-between gap-3 rounded-t-lg bg-slate-300 p-4 dark:bg-slate-300-night">
        <h2 className="text-md font-bold">Plugins :</h2>
      </div>

      <ScrollArea className="h-80">
        <div
          className="grid w-full gap-3 p-4"
          // 11rem is the fixed width of the card.
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
          }}
        >
          {plugins
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((plugin) => (
              <Tooltip
                key={plugin.id}
                trigger={
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    onClick={() => handlePluginSelect(plugin)}
                  />
                }
                label={plugin.description}
              />
            ))}
        </div>
      </ScrollArea>
      {selectedPlugin && (
        <RunPluginDialog
          onClose={handleDialogClose}
          plugin={selectedPlugin}
          pluginResourceTarget={pluginResourceTarget}
        />
      )}
    </div>
  );
}
