import {
  ActionRobotIcon,
  Avatar,
  Button,
  ContentMessage,
  ExternalLinkIcon,
  Markdown,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/components/actions/mcp/details/MCPActionDetails";
import { isAgentCreationResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPAgentManagementActionDetails({
  action,
  defaultOpen,
}: MCPActionDetailsProps) {
  const creationResult = action.output?.find(isAgentCreationResultResourceType);

  if (!creationResult) {
    // Fallback to showing the raw output if no structured data
    return (
      <ActionDetailsWrapper
        actionName="Create Agent"
        defaultOpen={defaultOpen}
        visual={ActionRobotIcon}
      >
        <div className="flex flex-col gap-4 pl-6 pt-4">
          <ContentMessage variant="primary" size="lg">
            <Markdown
              content={
                action.output
                  ?.map((o) => (o.type === "text" ? o.text : ""))
                  .join("\n") || "Agent creation completed."
              }
            />
          </ContentMessage>
        </div>
      </ActionDetailsWrapper>
    );
  }

  const { mainAgent, subAgent } = creationResult.resource;

  return (
    <ActionDetailsWrapper
      actionName="Create Agent"
      defaultOpen={defaultOpen}
      visual={ActionRobotIcon}
    >
      <div className="flex flex-col gap-6 pl-6 pt-4">
        {/* Main Agent Details */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar visual={mainAgent.pictureUrl} size="md" />
            <div className="flex flex-col">
              <span className="text-base font-semibold text-foreground dark:text-foreground-night">
                @{mainAgent.name}
              </span>
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                {mainAgent.description}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground dark:text-foreground-night">
              Default Tools
            </span>
            <ul className="list-inside list-disc text-sm text-muted-foreground dark:text-muted-foreground-night">
              <li>Web search and browse tools</li>
              <li>Search across workspace data sources</li>
              <li>Query tools for data warehouses in Company Data</li>
              {subAgent && <li>Run @{subAgent.name} sub-agent</li>}
            </ul>
          </div>

          <Button
            icon={ExternalLinkIcon}
            label="View Agent"
            variant="outline"
            onClick={() => window.open(mainAgent.url, "_blank")}
            size="xs"
          />
        </div>

        {/* Sub-Agent Details */}
        {subAgent && (
          <>
            <div className="border-border-light border-t dark:border-border-dark" />
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Avatar visual={subAgent.pictureUrl} size="md" />
                <div className="flex flex-col">
                  <span className="text-base font-semibold text-foreground dark:text-foreground-night">
                    @{subAgent.name}
                  </span>
                  <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    Sub-agent • {subAgent.description}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                  Available to Main Agent
                </span>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  This sub-agent can be called by the main agent using the{" "}
                  <code className="bg-bg-light-structure dark:bg-bg-dark-structure rounded px-1 py-0.5 text-xs">
                    run_{subAgent.name}
                  </code>{" "}
                  tool. It has access to the same tools as the main agent.
                </p>
              </div>

              <Button
                icon={ExternalLinkIcon}
                label="View Sub-Agent"
                variant="outline"
                onClick={() => window.open(subAgent.url, "_blank")}
                size="xs"
              />
            </div>
          </>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}
