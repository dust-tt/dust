import { PluginList } from "@app/components/poke/plugins/PluginList";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";

export function PluginsPage() {
  useDocumentTitle("Poke - Plugins");

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
