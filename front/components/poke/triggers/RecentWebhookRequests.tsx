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
import React, { useState } from "react";

import { TriggerFilterRenderer } from "@app/components/agent_builder/triggers/TriggerFilterRenderer";
import { WebhookRequestStatusBadge } from "@app/components/agent_builder/triggers/WebhookRequestStatusBadge";
import { usePokeWebhookRequests } from "@app/poke/swr/triggers";
import type { LightWorkspaceType } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

interface PokeRecentWebhookRequestsProps {
  owner: LightWorkspaceType;
  trigger: TriggerType;
}

export function PokeRecentWebhookRequests({
  owner,
  trigger,
}: PokeRecentWebhookRequestsProps) {
  const defaultOpen = true;
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-material-200 my-4 flex min-h-24 flex-col rounded-lg border bg-muted-background dark:bg-muted-background-night">
      <div className="flex justify-between gap-3 rounded-t-lg bg-primary-300 p-4 dark:bg-primary-300-night">
        <h2 className="text-md font-bold">Webhook Request History</h2>
      </div>
      <div className="flex flex-grow flex-col justify-center p-4">
        {trigger.naturalLanguageDescription && (
          <div className="bg-secondary mb-4 rounded-md border border-border p-4 dark:border-border-night">
            <p className="text-sm font-medium text-foreground dark:text-foreground-night">
              Natural language description
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground dark:text-muted-foreground-night">
              {trigger.naturalLanguageDescription}
            </p>
          </div>
        )}
        {trigger.kind === "webhook" && (
          <div className="bg-secondary mb-4 rounded-md border border-border p-4 dark:border-border-night">
            <p className="pb-4 text-sm font-medium text-foreground dark:text-foreground-night">
              Filter
            </p>
            {trigger.configuration.filter ? (
              <TriggerFilterRenderer data={trigger.configuration.filter} />
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground dark:text-muted-foreground-night">
                No filter
              </p>
            )}
          </div>
        )}
        <Collapsible defaultOpen={defaultOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger>
            <Label className="cursor-pointer">Recent requests (last 15)</Label>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <PokeRecentWebhookRequestsContent
              isOpen={isOpen}
              owner={owner}
              triggerId={trigger.sId}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

interface PokeRecentWebhookRequestsContentProps {
  isOpen: boolean;
  owner: LightWorkspaceType;
  triggerId: string;
}

function PokeRecentWebhookRequestsContent({
  isOpen,
  owner,
  triggerId,
}: PokeRecentWebhookRequestsContentProps) {
  const { webhookRequests, isWebhookRequestsLoading, isWebhookRequestsError } =
    usePokeWebhookRequests({
      owner,
      triggerId,
      disabled: !isOpen,
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
          Some requests were rate limited.
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
