import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { PluginList } from "@app/components/poke/plugins/PluginList";

export function PluginsPage() {
  useSetPokePageTitle("Plugins");

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
