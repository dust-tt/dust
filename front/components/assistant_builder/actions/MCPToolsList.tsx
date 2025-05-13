import { ContentMessage, ScrollArea } from "@dust-tt/sparkle";

import { asDisplayName } from "@app/types";

export function MCPToolsList({
  tools,
}: {
  tools: { name: string; description: string }[];
}) {
  return (
    <div>
      {tools.length === 0 ? (
        <p className="text-sm text-faint">No tools available</p>
      ) : (
        <>
          <h4 className="heading-xl mb-3 flex-grow pt-4 text-foreground dark:text-foreground-night">
            Available tools
          </h4>
          <ContentMessage variant="primary" className="max-w-full">
            <ScrollArea className="h-36">
              <div className="flex flex-col gap-4 space-y-0">
                {tools.map(
                  (
                    tool: { name: string; description: string },
                    index: number
                  ) => {
                    return (
                      <dl
                        key={index}
                        className="flex flex-col gap-1 last:border-b-0 last:pb-0"
                      >
                        <div>
                          <dt className="heading-sm flex-grow text-foreground dark:text-foreground-night">
                            {asDisplayName(tool.name)}
                          </dt>
                          {tool.description && (
                            <dd className="copy-xs text-muted-foreground dark:text-muted-foreground-night">
                              {tool.description}
                            </dd>
                          )}
                        </div>
                      </dl>
                    );
                  }
                )}
              </div>
            </ScrollArea>
          </ContentMessage>
        </>
      )}
    </div>
  );
}
