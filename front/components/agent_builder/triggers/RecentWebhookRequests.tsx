import {
  CollapsibleComponent,
  Label,
  Markdown,
  Spinner,
} from "@dust-tt/sparkle";
import moment from "moment";
import React, { useState } from "react";

import type { AgentBuilderWebhookTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useWebhookRequestTriggersForTrigger } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";

import { WebhookRequestStatusBadge } from "./WebhookRequestStatusBadge";

interface RecentWebhookRequestsProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string | null;
  trigger: AgentBuilderWebhookTriggerType;
}

export function RecentWebhookRequests({
  owner,
  agentConfigurationId,
  trigger,
}: RecentWebhookRequestsProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <CollapsibleComponent
      rootProps={{ defaultOpen: false, onOpenChange: setIsOpen }}
      triggerChildren={
        <Label className="cursor-pointer">Recent Requests</Label>
      }
      contentChildren={
        <div className="pt-2">
          <RecentWebhookRequestsContent
            isOpen={isOpen}
            owner={owner}
            agentConfigurationId={agentConfigurationId}
            trigger={trigger}
          />
        </div>
      }
    />
  );
}

interface RecentWebhookRequestsContentProps {
  isOpen: boolean;
  owner: LightWorkspaceType;
  agentConfigurationId: string | null;
  trigger: AgentBuilderWebhookTriggerType;
}

function RecentWebhookRequestsContent({
  isOpen,
  owner,
  agentConfigurationId,
  trigger,
}: RecentWebhookRequestsContentProps) {
  const { webhookRequests, isWebhookRequestsLoading, isWebhookRequestsError } =
    useWebhookRequestTriggersForTrigger({
      owner,
      agentConfigurationId,
      triggerId: trigger.sId ?? null,
      disabled: !trigger || !agentConfigurationId || !isOpen,
    });

  const [expandedRequestId, setExpandedRequestId] = useState<number | null>(
    null
  );

  if (isWebhookRequestsLoading || !isOpen) {
    return (
      <div className="flex items-center gap-2">
        <Spinner size="sm" />
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Loading recent requests...
        </span>
      </div>
    );
  }

  if (isWebhookRequestsError) {
    return (
      <p className="text-sm text-warning">
        Unable to load recent webhook requests.
      </p>
    );
  }

  if (webhookRequests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        No webhook requests yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {webhookRequests.map((request) => (
        <div
          key={request.id}
          className="bg-secondary dark:bg-secondary-night rounded-lg border border-border p-3 dark:border-border-night"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="text-sm font-medium text-foreground dark:text-foreground-night"
                title={new Date(request.timestamp).toLocaleString()}
              >
                {moment(new Date(request.timestamp)).fromNow()}
              </span>
              <WebhookRequestStatusBadge status={request.status} />
            </div>
            {request.payload && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setExpandedRequestId(
                    expandedRequestId === request.id ? null : request.id
                  );
                }}
                className="text-action-secondary hover:text-action-secondary-hover dark:text-action-secondary-night dark:hover:text-action-secondary-hover-night text-xs"
              >
                {expandedRequestId === request.id ? "Hide" : "View"} Payload
              </button>
            )}
          </div>

          {expandedRequestId === request.id && request.payload && (
            <div className="mt-3 rounded bg-background p-2 dark:bg-background-night">
              <pre className="max-h-48 overflow-auto text-xs text-foreground dark:text-foreground-night">
                <Markdown
                  forcedTextSize="xs"
                  content={`\`\`\`json\n${JSON.stringify(request.payload.body, null, 2)}\n\`\`\``}
                />
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
