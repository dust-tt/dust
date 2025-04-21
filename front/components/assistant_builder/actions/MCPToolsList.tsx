import { asDisplayName } from "@app/types";

export function MCPToolsList({
  tools,
}: {
  tools: { name: string; description: string }[];
}) {
  return (
    <>
      <div className="flex-grow pt-4 text-sm font-semibold text-foreground dark:text-foreground-night">
        Available tools
      </div>

      {tools ? (
        <div className="space-y-0">
          {tools.map(
            (tool: { name: string; description: string }, index: number) => {
              return (
                <div
                  key={index}
                  className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 last:pb-0"
                >
                  <h4 className="flex-grow text-foreground dark:text-foreground-night">
                    {asDisplayName(tool.name)}
                  </h4>
                  {tool.description && (
                    <p className="copy-xs text-muted-foreground dark:text-muted-foreground-night">
                      {tool.description}
                    </p>
                  )}
                </div>
              );
            }
          )}
        </div>
      ) : (
        <p className="text-sm text-faint">No tools available</p>
      )}
    </>
  );
}
