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
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

export function ViewTriggerTable({
  trigger,
  agent,
  owner,
}: {
  trigger: TriggerType;
  agent: LightAgentConfigurationType;
  owner: LightWorkspaceType;
}) {
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
                <PokeTableHead>Configuration</PokeTableHead>
                <PokeTableCell>
                  {trigger.kind === "schedule"
                    ? `${trigger.configuration.cron} (${trigger.configuration.timezone})`
                    : JSON.stringify(trigger.configuration)}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Custom Prompt</PokeTableHead>
                {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
                <PokeTableCell>{trigger.customPrompt || "None"}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Enabled</PokeTableHead>
                <PokeTableCell>{trigger.enabled ? "Yes" : "No"}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Editor</PokeTableHead>
                <PokeTableCell>{trigger.editor}</PokeTableCell>
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
    </div>
  );
}
