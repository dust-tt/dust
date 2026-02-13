import { LinkWrapper, Spinner } from "@dust-tt/sparkle";

import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokeWebhookSourceDetails } from "@app/poke/swr/webhook_source_details";

export function WebhookSourceDetailsPage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - Webhook Source`);

  const webhookSourceId = useRequiredPathParam("wsId");
  const {
    data: details,
    isLoading,
    isError,
  } = usePokeWebhookSourceDetails({
    owner,
    webhookSourceId,
    disabled: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !details) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading webhook source details.</p>
      </div>
    );
  }

  const { webhookSource, views, triggers, requestStats } = details;

  return (
    <>
      <h3 className="text-xl font-bold">
        Webhook Source {webhookSource.name}{" "}
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
      </h3>
      <div className="flex flex-row gap-x-6">
        {/* Left column: Overview table */}
        <div className="flex flex-col space-y-8">
          <div className="flex justify-between gap-3">
            <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
              <h2 className="text-md pb-4 font-bold">Overview</h2>
              <PokeTable>
                <PokeTableBody>
                  <PokeTableRow>
                    <PokeTableHead>sId</PokeTableHead>
                    <PokeTableCellWithCopy label={webhookSource.sId} />
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Name</PokeTableHead>
                    <PokeTableCell>{webhookSource.name}</PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Provider</PokeTableHead>
                    <PokeTableCell>
                      {webhookSource.provider ?? "Custom"}
                    </PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Events</PokeTableHead>
                    <PokeTableCell>
                      {webhookSource.subscribedEvents.length > 0
                        ? webhookSource.subscribedEvents.join(", ")
                        : "All"}
                    </PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Secret</PokeTableHead>
                    <PokeTableCell>{webhookSource.secret ?? "-"}</PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>URL Secret</PokeTableHead>
                    <PokeTableCellWithCopy label={webhookSource.urlSecret} />
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Signature Header</PokeTableHead>
                    <PokeTableCell>
                      {webhookSource.signatureHeader ?? "-"}
                    </PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Signature Algorithm</PokeTableHead>
                    <PokeTableCell>
                      {webhookSource.signatureAlgorithm ?? "-"}
                    </PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Remote Metadata</PokeTableHead>
                    <PokeTableCell>
                      {webhookSource.remoteMetadata
                        ? JSON.stringify(webhookSource.remoteMetadata)
                        : "-"}
                    </PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>OAuth Connection</PokeTableHead>
                    <PokeTableCell>
                      {webhookSource.oauthConnectionId ?? "-"}
                    </PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Created At</PokeTableHead>
                    <PokeTableCell>
                      {formatTimestampToFriendlyDate(webhookSource.createdAt)}
                    </PokeTableCell>
                  </PokeTableRow>
                </PokeTableBody>
              </PokeTable>
            </div>
          </div>
        </div>

        {/* Right column: Views, Triggers, Request Stats */}
        <div className="mt-4 flex grow flex-col gap-4">
          {/* Views */}
          <div className="border-material-200 flex flex-col rounded-lg border p-4">
            <h2 className="text-md pb-4 font-bold">Views ({views.length})</h2>
            {views.length === 0 ? (
              <p className="text-sm text-muted-foreground">No views found.</p>
            ) : (
              <PokeTable>
                <PokeTableBody>
                  {views.map((view) => (
                    <PokeTableRow key={view.sId}>
                      <PokeTableHead>{view.customName}</PokeTableHead>
                      <PokeTableCell>
                        <span className="text-xs text-muted-foreground">
                          {view.sId}
                        </span>
                        {view.description && (
                          <span className="ml-2 text-xs">
                            {view.description}
                          </span>
                        )}
                      </PokeTableCell>
                    </PokeTableRow>
                  ))}
                </PokeTableBody>
              </PokeTable>
            )}
          </div>

          {/* Connected Triggers */}
          <div className="border-material-200 flex flex-col rounded-lg border p-4">
            <h2 className="text-md pb-4 font-bold">
              Connected Triggers ({triggers.length})
            </h2>
            {triggers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No connected triggers.
              </p>
            ) : (
              <PokeTable>
                <PokeTableBody>
                  {triggers.map((trigger) => (
                    <PokeTableRow key={trigger.sId}>
                      <PokeTableHead>{trigger.name}</PokeTableHead>
                      <PokeTableCell>
                        <div className="flex flex-col gap-1">
                          <LinkWrapper
                            href={`/poke/${owner.sId}/assistants/${trigger.agentConfigurationId}/triggers/${trigger.sId}`}
                            className="text-highlight-500"
                          >
                            {trigger.sId}
                          </LinkWrapper>
                          <span className="text-xs text-muted-foreground">
                            {trigger.status} | {trigger.origin}
                            {trigger.editorUser
                              ? ` | ${trigger.editorUser.email}`
                              : ""}
                          </span>
                        </div>
                      </PokeTableCell>
                    </PokeTableRow>
                  ))}
                </PokeTableBody>
              </PokeTable>
            )}
          </div>

          {/* Request Volume Stats */}
          <div className="border-material-200 flex flex-col rounded-lg border p-4">
            <h2 className="text-md pb-4 font-bold">Request Volume</h2>
            <div className="flex gap-6">
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold">
                  {requestStats.last24h}
                </span>
                <span className="text-xs text-muted-foreground">Last 24h</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold">
                  {requestStats.last7d}
                </span>
                <span className="text-xs text-muted-foreground">Last 7d</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold">
                  {requestStats.last30d}
                </span>
                <span className="text-xs text-muted-foreground">Last 30d</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
