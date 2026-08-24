import { PluginRunsList } from "@app/components/poke/plugins/PluginRunsList";
import { RunPluginDialog } from "@app/components/poke/plugins/RunPluginDialog";
import {
  PokeCard,
  PokeCardHeader,
  PokeCardTitle,
} from "@app/components/poke/shadcn/ui/card";
import type { PluginListItem } from "@app/lib/api/poke/types";
import { usePokeListPluginForResourceType } from "@app/poke/swr/plugins";
import type { PluginResourceTarget } from "@app/types/poke/plugins";
import { Button, cn, Input, Tooltip } from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useMemo, useState } from "react";

interface PluginCardProps {
  onClick: () => void;
  plugin: PluginListItem;
}

function PluginCard({ onClick, plugin }: PluginCardProps) {
  return (
    <PokeCard
      className="flex h-16 w-full cursor-pointer items-center hover:bg-muted-background"
      onClick={onClick}
    >
      <PokeCardHeader className="flex overflow-hidden p-2 text-left">
        <PokeCardTitle className="text-sm font-medium">
          {plugin.name}
        </PokeCardTitle>
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
  const [searchQuery, setSearchQuery] = useState("");
  const [showRuns, setShowRuns] = useState(false);

  const handlePluginSelect = (plugin: PluginListItem) => {
    setSelectedPlugin(plugin);
  };

  const handleDialogClose = () => {
    setSelectedPlugin(null);
  };

  const filteredPlugins = useMemo(() => {
    if (!searchQuery.trim()) {
      return plugins;
    }

    const query = searchQuery.toLowerCase().trim();
    return plugins.filter(
      (plugin) =>
        // Search by name or description.
        plugin.name.toLowerCase().includes(query) ||
        plugin.description.toLowerCase().includes(query)
    );
  }, [plugins, searchQuery]);

  return (
    <div className="flex min-h-48 flex-col rounded-lg border bg-background">
      <div className="flex items-center justify-between gap-3 rounded-t-lg border-b border-separator bg-background p-4">
        <div className="flex items-center gap-3">
          <h2 className="text-md font-bold">Plugins</h2>
        </div>
        <div className="max-w-xs flex-1">
          <div className="flex flex-row gap-2">
            <Input
              placeholder="Search plugins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn("w-full bg-background", showRuns && "invisible")}
            />
            <Button
              label={showRuns ? "Show Available" : "Show History"}
              variant={showRuns ? "primary" : "outline"}
              size="sm"
              onClick={() => setShowRuns(!showRuns)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        {!showRuns ? (
          <div className="flex flex-1 flex-col">
            {filteredPlugins.length === 0 ? (
              <div className="flex min-h-32 flex-1 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
                {searchQuery.trim() ? (
                  <p>No plugins match your search.</p>
                ) : (
                  <p>No plugins available.</p>
                )}
              </div>
            ) : (
              <div
                className="grid w-full gap-3 p-3"
                // 11rem is the minimum card width.
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
                }}
              >
                {filteredPlugins
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
            )}
          </div>
        ) : (
          <PluginRunsList pluginResourceTarget={pluginResourceTarget} />
        )}
      </div>
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
