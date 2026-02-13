import { Chip } from "@dust-tt/sparkle";

import { TriggerFilterRenderer } from "@app/components/agent_builder/triggers/TriggerFilterRenderer";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableCellWithLink,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TriggerType } from "@app/types/assistant/triggers";
import { DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT } from "@app/types/assistant/triggers";
import type { LightWorkspaceType, UserType } from "@app/types/user";

interface ViewTriggerTableProps {
  trigger: TriggerType;
  agent: LightAgentConfigurationType;
  owner: LightWorkspaceType;
  editorUser?: UserType | null;
}

export function ViewTriggerTable({
  trigger,
  agent,
  owner,
  editorUser,
}: ViewTriggerTableProps) {
  return (
    <div className="flex flex-col space-y-8">
      <div className="flex justify-between gap-3">
        <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-md flex-grow pb-4 font-bold">Overview</h2>
          </div>
          <PokeTable>
            <PokeTableBody>
              <PokeTableRow>
                <PokeTableHead>Id</PokeTableHead>
                <PokeTableCellWithCopy label={trigger.id.toString()} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>sId</PokeTableHead>
                <PokeTableCellWithCopy label={trigger.sId} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Agent</PokeTableHead>
                <PokeTableCellWithLink
                  href={`/poke/${owner.sId}/assistants/${agent.sId}`}
                  content={`${agent.name} (${agent.sId})`}
                />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Name</PokeTableHead>
                <PokeTableCell>{trigger.name}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Kind</PokeTableHead>
                <PokeTableCell>{trigger.kind}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Origin</PokeTableHead>
                <PokeTableCell>
                  <Chip
                    color={trigger.origin === "agent" ? "info" : "primary"}
                    size="xs"
                  >
                    {trigger.origin}
                  </Chip>
                </PokeTableCell>
              </PokeTableRow>

              {/* Configuration - structured by kind */}
              {trigger.kind === "schedule" ? (
                <>
                  <PokeTableRow>
                    <PokeTableHead>Cron</PokeTableHead>
                    <PokeTableCell>{trigger.configuration.cron}</PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Timezone</PokeTableHead>
                    <PokeTableCell>
                      {trigger.configuration.timezone}
                    </PokeTableCell>
                  </PokeTableRow>
                </>
              ) : (
                <>
                  <PokeTableRow>
                    <PokeTableHead>Include Payload</PokeTableHead>
                    <PokeTableCell>
                      {trigger.configuration.includePayload ? "Yes" : "No"}
                    </PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Event Filter</PokeTableHead>
                    <PokeTableCell>
                      {trigger.configuration.event ?? "All events"}
                    </PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Execution Mode</PokeTableHead>
                    <PokeTableCell>
                      {trigger.executionMode ?? "not set"}
                    </PokeTableCell>
                  </PokeTableRow>
                  <PokeTableRow>
                    <PokeTableHead>Execution Limit</PokeTableHead>
                    <PokeTableCell>
                      {trigger.executionPerDayLimitOverride ??
                        `Default (${DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT})`}
                    </PokeTableCell>
                  </PokeTableRow>
                  {trigger.webhookSourceViewSId && (
                    <PokeTableRow>
                      <PokeTableHead>Webhook Source View</PokeTableHead>
                      <PokeTableCellWithCopy
                        label={trigger.webhookSourceViewSId}
                      />
                    </PokeTableRow>
                  )}
                </>
              )}

              <PokeTableRow>
                <PokeTableHead>Status</PokeTableHead>
                <PokeTableCell>{trigger.status}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Editor</PokeTableHead>
                <PokeTableCell>
                  {editorUser
                    ? `${editorUser.fullName} (${editorUser.email})`
                    : (trigger.editor?.toString() ?? "-")}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Created At</PokeTableHead>
                <PokeTableCell>
                  {formatTimestampToFriendlyDate(trigger.createdAt)}
                </PokeTableCell>
              </PokeTableRow>
            </PokeTableBody>
          </PokeTable>
        </div>
      </div>
      {trigger.kind === "webhook" && (
        <div className="border-material-200 flex flex-col rounded-lg border p-4">
          <h2 className="text-md pb-4 font-bold">Filter Expression</h2>
          {trigger.configuration.filter ? (
            <TriggerFilterRenderer data={trigger.configuration.filter} />
          ) : (
            <p className="text-sm text-muted-foreground">No filter</p>
          )}
        </div>
      )}
    </div>
  );
}
