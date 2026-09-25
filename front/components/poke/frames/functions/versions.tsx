import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableHead,
  PokeTableHeader,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { PokeFrameFunctionVersion } from "@app/lib/api/poke/frames";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, LinkWrapper } from "@dust-tt/sparkle";

const BUNDLE_HASH_PREFIX_LENGTH = 12;

// Whether a version's code differs from the version published before it. Most republishes change
// something else in the Frame, so a function's code usually carries over unchanged.
function codeChangeLabel(
  version: PokeFrameFunctionVersion,
  previous: PokeFrameFunctionVersion | undefined
): string {
  if (!previous) {
    return "First version";
  }
  if (version.bundleSha256 === null || previous.bundleSha256 === null) {
    return "Unknown";
  }

  return version.bundleSha256 === previous.bundleSha256
    ? "Unchanged"
    : "Changed";
}

interface FrameFunctionVersionsTableProps {
  frameId: string;
  owner: LightWorkspaceType;
  selectedVersionId: string;
  slug: string;
  // Newest first.
  versions: PokeFrameFunctionVersion[];
}

export function FrameFunctionVersionsTable({
  frameId,
  owner,
  selectedVersionId,
  slug,
  versions,
}: FrameFunctionVersionsTableProps) {
  return (
    <div className="my-4 flex flex-col rounded-lg border p-4">
      <h2 className="text-md pb-4 font-bold">Versions ({versions.length})</h2>
      <PokeTable>
        <PokeTableHeader>
          <PokeTableRow>
            <PokeTableHead>Published</PokeTableHead>
            <PokeTableHead>Publication</PokeTableHead>
            <PokeTableHead>Code</PokeTableHead>
            <PokeTableHead>Invocations</PokeTableHead>
            <PokeTableHead>Version</PokeTableHead>
          </PokeTableRow>
        </PokeTableHeader>
        <PokeTableBody>
          {versions.map((version, index) => {
            const codeChange = codeChangeLabel(version, versions[index + 1]);

            return (
              <PokeTableRow
                key={version.sId}
                className={
                  version.sId === selectedVersionId ? "bg-muted" : undefined
                }
              >
                <PokeTableCell>
                  {formatTimestampToFriendlyDate(
                    new Date(version.createdAt).getTime()
                  )}
                </PokeTableCell>
                <PokeTableCell>
                  <span className="flex items-center gap-2 font-mono text-xs">
                    {version.publicationId}
                    {version.isActivePublication && (
                      <Chip size="xs" color="success" label="Active" />
                    )}
                  </span>
                </PokeTableCell>
                <PokeTableCell>
                  <span className="flex items-center gap-2">
                    <Chip
                      size="xs"
                      color={codeChange === "Changed" ? "highlight" : "primary"}
                      label={codeChange}
                    />
                    {version.bundleSha256 && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {version.bundleSha256.slice(
                          0,
                          BUNDLE_HASH_PREFIX_LENGTH
                        )}
                      </span>
                    )}
                  </span>
                </PokeTableCell>
                <PokeTableCell>{version.invocationCount}</PokeTableCell>
                <PokeTableCell>
                  {version.sId === selectedVersionId ? (
                    <span className="font-medium">{version.sId}</span>
                  ) : (
                    <LinkWrapper
                      href={`/poke/${owner.sId}/files/${frameId}/functions/${slug}?version=${version.sId}`}
                      className="text-highlight-500"
                    >
                      {version.sId}
                    </LinkWrapper>
                  )}
                </PokeTableCell>
              </PokeTableRow>
            );
          })}
        </PokeTableBody>
      </PokeTable>
    </div>
  );
}
