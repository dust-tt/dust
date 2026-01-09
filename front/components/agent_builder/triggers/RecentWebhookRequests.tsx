import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessageInline,
  Label,
  Markdown,
  Separator,
  Spinner,
} from "@dust-tt/sparkle";
import moment from "moment";
import Link from "next/link";
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
  const defaultOpen = true;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <Collapsible defaultOpen={defaultOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger>
        <Label className="cursor-pointer">Request history</Label>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <RecentWebhookRequestsContent
          isOpen={isOpen}
          owner={owner}
          agentConfigurationId={agentConfigurationId}
          trigger={trigger}
        />
      </CollapsibleContent>
    </Collapsible>
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
      <ContentMessageInline variant="warning">
        Unable to load recent webhook requests.
      </ContentMessageInline>
    );
  }

  if (webhookRequests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        No webhook requests yet.
      </p>
    );
  }

  const wasRateLimited = webhookRequests.some(
    (request) => request.status === "rate_limited"
  );

  return (
    <div className="space-y-2">
      {wasRateLimited && (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          <p>
            Some requests were rate limited.
            <br />
            Contact{" "}
            <Link
              href="mailto:support@dust.tt?subject=Increase%20Webhook%20Trigger%20Rate%20Limit"
              className="underline"
            >
              support@dust.tt
            </Link>{" "}
            to increase the rate limit for this trigger.
          </p>
        </div>
      )}
      <div className="flex flex-col px-4">
        {webhookRequests.map((request, idx) => (
          <div key={request.id}>
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger>
                <div className="my-2 flex w-full items-center justify-between gap-4">
                  {moment(new Date(request.timestamp)).calendar(undefined, {
                    sameDay: "[Today at] LTS",
                    lastDay: "[Yesterday at] LTS",
                    lastWeek: "[Last] dddd [at] LTS",
                  })}
                  <WebhookRequestStatusBadge status={request.status} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {request.payload ? (
                  <div className="rounded">
                    <pre className="max-h-64 overflow-auto text-xs">
                      <Markdown
                        forcedTextSize="xs"
                        content={`\`\`\`json\n${JSON.stringify(request.payload.body, null, 2)}\n\`\`\``}
                      />
                    </pre>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    No payload available.
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
            {idx < webhookRequests.length - 1 && <Separator />}
          </div>
        ))}
      </div>
    </div>
  );
}
