import { RequestedSpacesList } from "@app/components/poke/assistants/RequestedSpacesList";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { ContentMessage, InfoCircle } from "@dust-tt/sparkle";

interface AgentOverviewTableProps {
  agentConfiguration: AgentConfigurationType;
  authors: UserType[];
  owner: LightWorkspaceType;
  spacesById: Map<string, SpaceType>;
}

export function AgentOverviewTable({
  agentConfiguration,
  authors,
  owner,
  spacesById,
}: AgentOverviewTableProps) {
  const author = authors.find(
    (user) => user.id === agentConfiguration.versionAuthorId
  );

  const restrictedSpaces = agentConfiguration.requestedSpaceIds
    .map((spaceId) => spacesById.get(spaceId))
    .filter(
      (space): space is SpaceType => space !== undefined && space.isRestricted
    );

  return (
    <>
      <div className="border-material-200 flex flex-grow flex-col rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-md flex-grow pb-4 font-bold">
            @{agentConfiguration.name}
          </h2>
        </div>
        {restrictedSpaces.length > 0 && (
          <ContentMessage
            title="Restricted space access"
            variant="warning"
            icon={InfoCircle}
            size="lg"
            className="mb-4 w-full"
          >
            <div className="flex flex-col gap-2">
              <div>
                Only users who are members of all restricted spaces can access
                this agent. API keys must also be scoped to include all of these
                spaces.
              </div>
              <RequestedSpacesList
                owner={owner}
                requestedSpaceIds={restrictedSpaces.map((space) => space.sId)}
                spacesById={spacesById}
              />
            </div>
          </ContentMessage>
        )}
        <PokeTable>
          <PokeTableBody>
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
              <PokeTableCell>
                <RequestedSpacesList
                  owner={owner}
                  requestedSpaceIds={agentConfiguration.requestedSpaceIds}
                  spacesById={spacesById}
                />
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Status</PokeTableCell>
              <PokeTableCell>
                <span className="capitalize">
                  {agentConfiguration.status} (v{agentConfiguration.version})
                </span>
              </PokeTableCell>
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
