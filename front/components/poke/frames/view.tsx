import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { PokeFrameDetails } from "@app/lib/api/poke/frames";
import { makeSandboxConnectCommand } from "@app/lib/poke/sandbox";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType } from "@app/types/user";
import { LinkWrapper } from "@dust-tt/sparkle";

interface ViewFrameTableProps {
  details: PokeFrameDetails;
  owner: LightWorkspaceType;
}

export function ViewFrameTable({ details, owner }: ViewFrameTableProps) {
  const { frame, sandbox } = details;

  return (
    <div className="my-4 flex flex-col rounded-lg border p-4">
      <h2 className="text-md pb-4 font-bold">Overview</h2>
      <PokeTable>
        <PokeTableBody>
          <PokeTableRow>
            <PokeTableHead>sId</PokeTableHead>
            <PokeTableCellWithCopy label={frame.sId} />
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Name</PokeTableHead>
            <PokeTableCell>{frame.name ?? "—"}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Description</PokeTableHead>
            <PokeTableCell>{frame.description ?? "—"}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>File status</PokeTableHead>
            <PokeTableCell>{frame.status}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Mount path</PokeTableHead>
            {frame.mountFilePath ? (
              <PokeTableCellWithCopy label={frame.mountFilePath} />
            ) : (
              <PokeTableCell>—</PokeTableCell>
            )}
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Active publication</PokeTableHead>
            <PokeTableCell>
              {frame.activePublicationId ?? "unpublished"}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Origin</PokeTableHead>
            <PokeTableCell>
              {frame.conversationId ? (
                <LinkWrapper
                  href={`/poke/${owner.sId}/conversation/${frame.conversationId}`}
                  className="text-highlight-500"
                >
                  {frame.conversationId}
                </LinkWrapper>
              ) : frame.spaceId ? (
                <LinkWrapper
                  href={`/poke/${owner.sId}/spaces/${frame.spaceId}`}
                  className="text-highlight-500"
                >
                  {frame.spaceId}
                </LinkWrapper>
              ) : (
                "—"
              )}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Author</PokeTableHead>
            <PokeTableCell>{frame.author ?? "—"}</PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Created</PokeTableHead>
            <PokeTableCell>
              {formatTimestampToFriendlyDate(
                new Date(frame.createdAt).getTime()
              )}
            </PokeTableCell>
          </PokeTableRow>
          <PokeTableRow>
            <PokeTableHead>Updated</PokeTableHead>
            <PokeTableCell>
              {formatTimestampToFriendlyDate(
                new Date(frame.updatedAt).getTime()
              )}
            </PokeTableCell>
          </PokeTableRow>
          {sandbox ? (
            <>
              <PokeTableRow>
                <PokeTableHead>Sandbox status</PokeTableHead>
                <PokeTableCell>{sandbox.status}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Sandbox connect</PokeTableHead>
                <PokeTableCellWithCopy
                  label={makeSandboxConnectCommand(sandbox)}
                />
              </PokeTableRow>
            </>
          ) : (
            <PokeTableRow>
              <PokeTableHead>Sandbox</PokeTableHead>
              <PokeTableCell>None</PokeTableCell>
            </PokeTableRow>
          )}
        </PokeTableBody>
      </PokeTable>
    </div>
  );
}
