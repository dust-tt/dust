import {
  ActionRobotIcon,
  Avatar,
  Button,
  CollapsibleComponent,
  ContentMessage,
  ExternalLinkIcon,
  Markdown,
} from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isAgentCreationResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPAgentManagementActionDetails({
  toolOutput,
  toolParams,
  viewType,
  owner,
  messageStatus,
}: ToolExecutionDetailsProps) {
  const creationResult = toolOutput?.find(isAgentCreationResultResourceType);
  const { mutate } = useSWRConfig();
  const hasRefreshed = useRef(false);

  // Refresh agent list when:
  // 1. We have a successful creation result
  // 2. The message is still streaming (status === "created")
  // 3. We haven't refreshed yet (to avoid multiple refreshes)
  useEffect(() => {
    if (
      creationResult &&
      !hasRefreshed.current &&
      messageStatus === "created"
    ) {
      hasRefreshed.current = true;

      // Refresh agent configurations with different views
      // These are the common patterns used in the app for fetching agents
      void mutate(
        (key) =>
          typeof key === "string" &&
          key.startsWith(`/api/w/${owner.sId}/assistant/agent_configurations`),
        undefined,
        { revalidate: true }
      );
    }
  }, [creationResult, messageStatus, mutate, owner.sId]);

  if (!creationResult) {
    // Fallback to showing the raw output if no structured data
    return (
      <ActionDetailsWrapper
        viewType={viewType}
        actionName={
          viewType === "conversation" ? "Creating agent" : "Create Agent"
        }
        visual={ActionRobotIcon}
      >
        <div className="flex flex-col gap-4 pl-6 pt-4">
          <ContentMessage variant="primary" size="lg">
            <Markdown
              content={
                toolOutput
                  ?.map((o) => (o.type === "text" ? o.text : ""))
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
      viewType={viewType}
      actionName="Create Agent"
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

          {typeof toolParams.instructions === "string" ? (
            <CollapsibleComponent
              triggerChildren={
                <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                  Instructions
                </span>
              }
              contentChildren={
                <div className="mt-2">
                  <ContentMessage variant="primary" size="sm">
                    <Markdown content={toolParams.instructions} />
                  </ContentMessage>
                </div>
              }
            />
          ) : null}

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

              {typeof toolParams.sub_agent_instructions === "string" ? (
                <CollapsibleComponent
                  triggerChildren={
                    <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                      Instructions
                    </span>
                  }
                  contentChildren={
                    <div className="mt-2">
                      <ContentMessage variant="primary" size="sm">
                        <Markdown content={toolParams.sub_agent_instructions} />
                      </ContentMessage>
                    </div>
                  }
                />
              ) : null}

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
