import { Icon, MagnifyingGlassIcon, PencilSquareIcon } from "@dust-tt/sparkle";

import { Grid, H2, P } from "@app/components/home/ContentComponents";
import { cn } from "@app/components/poke/shadcn/lib/utils";

import type { IntegrationTool } from "../types";

interface ToolsSectionProps {
  tools: IntegrationTool[];
  integrationName: string;
}

interface ToolItemProps {
  tool: IntegrationTool;
}

function ToolItem({ tool }: ToolItemProps) {
  return (
    <div className="group flex items-start gap-3 py-3">
      <div className="mt-0.5 flex-shrink-0">
        <div
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md",
            tool.isWriteAction
              ? "bg-warning-100 text-warning-800"
              : "bg-success-100 text-success-800"
          )}
        >
          <Icon
            visual={tool.isWriteAction ? PencilSquareIcon : MagnifyingGlassIcon}
            size="xs"
          />
        </div>
      </div>
      <div className="flex-1">
        <h4 className="font-medium text-foreground">{tool.displayName}</h4>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {tool.description}
        </p>
      </div>
    </div>
  );
}

export function ToolsSection({ tools, integrationName }: ToolsSectionProps) {
  const readTools = tools.filter((t) => !t.isWriteAction);
  const writeTools = tools.filter((t) => t.isWriteAction);

  return (
    <section className="py-16">
      <Grid>
        <div className="col-span-12">
          <H2 className="mb-4 text-center">
            What you can do with {integrationName}
          </H2>
          <P
            size="lg"
            className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground"
          >
            Dust AI agents can perform these actions on your behalf
          </P>
        </div>

        <div className="col-span-12">
          <div className="mx-auto max-w-4xl">
            <div
              className={cn(
                "grid gap-8",
                readTools.length > 0 && writeTools.length > 0
                  ? "md:grid-cols-2"
                  : "grid-cols-1"
              )}
            >
              {/* Read Actions */}
              {readTools.length > 0 && (
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-100">
                      <Icon
                        visual={MagnifyingGlassIcon}
                        size="sm"
                        className="text-success-800"
                      />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Read & Search
                    </h3>
                  </div>
                  <div className="divide-y divide-border">
                    {readTools.map((tool) => (
                      <ToolItem key={tool.name} tool={tool} />
                    ))}
                  </div>
                </div>
              )}

              {/* Write Actions */}
              {writeTools.length > 0 && (
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-100">
                      <Icon
                        visual={PencilSquareIcon}
                        size="sm"
                        className="text-warning-800"
                      />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Create & Update
                    </h3>
                  </div>
                  <div className="divide-y divide-border">
                    {writeTools.map((tool) => (
                      <ToolItem key={tool.name} tool={tool} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Grid>
    </section>
  );
}
