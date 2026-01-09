import { BookOpenIcon, PlusIcon } from "@dust-tt/sparkle";

import { Grid, H2 } from "@app/components/home/ContentComponents";

import type { IntegrationTool } from "../types";

interface ToolsSectionProps {
  tools: IntegrationTool[];
  integrationName: string;
}

export function ToolsSection({ tools, integrationName }: ToolsSectionProps) {
  if (tools.length === 0) {
    return null;
  }

  const readTools = tools.filter((t) => !t.isWriteAction);
  const writeTools = tools.filter((t) => t.isWriteAction);

  return (
    <div className="py-12 md:py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-8 text-center text-2xl font-semibold text-foreground md:text-3xl">
            What you can do with {integrationName}
          </H2>

          <div className="mx-auto max-w-4xl">
            <div className="grid gap-8 md:grid-cols-2">
              {/* Read Actions */}
              {readTools.length > 0 && (
                <div className="rounded-2xl border border-border bg-white p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                      <BookOpenIcon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Read & Search
                    </h3>
                  </div>
                  <ul className="space-y-2">
                    {readTools.map((tool) => (
                      <li
                        key={tool.name}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
                        <span>{tool.displayName}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Write Actions */}
              {writeTools.length > 0 && (
                <div className="rounded-2xl border border-border bg-white p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-600">
                      <PlusIcon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Create & Update
                    </h3>
                  </div>
                  <ul className="space-y-2">
                    {writeTools.map((tool) => (
                      <li
                        key={tool.name}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-400" />
                        <span>{tool.displayName}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Tool count summary */}
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {tools.length} total actions available
              {readTools.length > 0 &&
                writeTools.length > 0 &&
                ` (${readTools.length} read, ${writeTools.length} write)`}
            </p>
          </div>
        </div>
      </Grid>
    </div>
  );
}
