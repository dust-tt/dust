import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { PokeFrameSharing } from "@app/lib/api/poke/frames";
import type { SharingGrantType } from "@app/types/files";
import { dateToHumanReadable } from "@app/types/shared/utils/date_utils";
import { Chip } from "@dust-tt/sparkle";

interface FrameSharingSectionProps {
  sharing: PokeFrameSharing;
  sharingGrants: SharingGrantType[];
}

export function FrameSharingSection({
  sharing,
  sharingGrants,
}: FrameSharingSectionProps) {
  const activeGrants = sharingGrants.filter((grant) => !grant.revokedAt);
  const revokedGrants = sharingGrants.filter((grant) => grant.revokedAt);

  return (
    <div className="my-4 flex flex-col rounded-lg border p-4">
      <h2 className="text-md pb-4 font-bold">Sharing</h2>
      {!sharing ? (
        <div className="text-sm text-muted-foreground">
          No sharing configured.
        </div>
      ) : (
        <PokeTable>
          <PokeTableBody>
            <PokeTableRow>
              <PokeTableHead>Scope</PokeTableHead>
              <PokeTableCell>{sharing.scope}</PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableHead>Shared at</PokeTableHead>
              <PokeTableCell>
                {dateToHumanReadable(new Date(sharing.sharedAt))}
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableHead>Share URL</PokeTableHead>
              <PokeTableCellWithCopy label={sharing.shareUrl} />
            </PokeTableRow>
          </PokeTableBody>
        </PokeTable>
      )}

      <GrantList
        grants={activeGrants}
        emptyMessage="No active grants."
        title={`Active grants (${activeGrants.length})`}
      />
      {revokedGrants.length > 0 && (
        <GrantList
          grants={revokedGrants}
          emptyMessage="No revoked grants."
          revoked
          title={`Revoked grants (${revokedGrants.length})`}
        />
      )}
    </div>
  );
}

interface GrantListProps {
  emptyMessage: string;
  grants: SharingGrantType[];
  revoked?: boolean;
  title: string;
}

function GrantList({
  emptyMessage,
  grants,
  revoked = false,
  title,
}: GrantListProps) {
  return (
    <div className="pt-4">
      <div className="pb-2 text-sm text-muted-foreground">{title}</div>
      {grants.length === 0 ? (
        <div className="text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {grants.map((grant) => (
            <div
              key={grant.id}
              className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${
                revoked ? "opacity-60" : ""
              }`}
            >
              <span className={`font-mono ${revoked ? "line-through" : ""}`}>
                {grant.email}
              </span>
              <div className="flex items-center gap-3 text-muted-foreground">
                {grant.blockedByPolicy && (
                  <Chip color="warning" label="Blocked by policy" size="xs" />
                )}
                {grant.revokedAt && (
                  <span className="text-xs">
                    Revoked {dateToHumanReadable(new Date(grant.revokedAt))}
                  </span>
                )}
                <span className="text-xs">
                  Granted {dateToHumanReadable(new Date(grant.grantedAt))}
                </span>
                {grant.grantedBy && (
                  <span className="text-xs">by {grant.grantedBy.fullName}</span>
                )}
                {grant.lastViewedAt && (
                  <span className="text-xs">
                    Last viewed{" "}
                    {dateToHumanReadable(new Date(grant.lastViewedAt))}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
