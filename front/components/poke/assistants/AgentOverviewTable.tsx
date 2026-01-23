import { Chip } from "@dust-tt/sparkle";

import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { AgentConfigurationType, SpaceType, UserType } from "@app/types";

interface AgentOverviewTableProps {
  agentConfiguration: AgentConfigurationType;
  authors: UserType[];
  spaces: SpaceType[];
}

export function AgentOverviewTable({
  agentConfiguration,
  authors,
  spaces,
}: AgentOverviewTableProps) {
  const author = authors.find(
    (user) => user.id === agentConfiguration.versionAuthorId
  );

  return (
    <>
      <div className="border-material-200 flex flex-grow flex-col rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-md flex-grow pb-4 font-bold">Overview</h2>
        </div>
        <PokeTable>
          <PokeTableBody>
            <PokeTableRow>
              <PokeTableCell>Name</PokeTableCell>
              <PokeTableCell>@{agentConfiguration.name}</PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Description</PokeTableCell>
              <PokeTableCell>{agentConfiguration.description}</PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Scope</PokeTableCell>
              <PokeTableCell>
                <span className="capitalize">{agentConfiguration.scope}</span>
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Spaces</PokeTableCell>
              <PokeTableCell className="flex flex-row space-x-2">
                {spaces.map((s) => {
                  return (
                    <Chip
                      key={s.sId}
                      size="sm"
                      color={s.isRestricted ? "warning" : "blue"}
                    >
                      {s.name}
                    </Chip>
                  );
                })}
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Status</PokeTableCell>
              <PokeTableCell>
                <span className="capitalize">{agentConfiguration.status}</span>
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Version</PokeTableCell>
              <PokeTableCell>v{agentConfiguration.version}</PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Created at</PokeTableCell>
              <PokeTableCell>
                {agentConfiguration.versionCreatedAt ?? "N/A"}
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Created by</PokeTableCell>
              <PokeTableCell>
                {author ? `${author.fullName} (${author.email})` : "N/A"}
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Max Steps</PokeTableCell>
              <PokeTableCell>{agentConfiguration.maxStepsPerRun}</PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Actions</PokeTableCell>
              <PokeTableCell>{agentConfiguration.actions.length}</PokeTableCell>
            </PokeTableRow>
          </PokeTableBody>
        </PokeTable>
      </div>
    </>
  );
}
