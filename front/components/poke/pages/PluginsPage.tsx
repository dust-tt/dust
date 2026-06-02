import { PluginList } from "@app/components/poke/plugins/PluginList";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";

export function PluginsPage() {
  usePokePageMetadata({ name: "Plugins" });

  return (
    <div className="h-full flex-grow flex-col items-center justify-center p-8 pt-8">
      <PluginList
        pluginResourceTarget={{
          resourceType: "global",
        }}
      />
    </div>
  );
}
