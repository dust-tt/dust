import { Button, Searchbar } from "@dust-tt/sparkle";
import type { VaultType, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import { useVaultInfo } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

type VaultMembersProps = {
  owner: WorkspaceType;
  isAdmin: boolean;
  vault: VaultType;
};

export const VaultMembers = ({ owner, isAdmin, vault }: VaultMembersProps) => {
  const [memberSearch, setMemberSearch] = useState<string>("");

  const { vaultInfo, isVaultInfoLoading } = useVaultInfo({
    workspaceId: owner.sId,
    vaultId: vault.sId,
  });

  const rows = vaultInfo?.members || [];

  return (
    <>
      <div
        className={classNames(
          "flex gap-2",
          rows.length === 0 && isAdmin
            ? "h-36 w-full max-w-4xl items-center justify-center rounded-lg border bg-structure-50"
            : ""
        )}
      >
        {rows.length > 0 && (
          <Searchbar
            name="search"
            placeholder="Search (Name)"
            value={memberSearch}
            onChange={(s) => {
              setMemberSearch(s);
            }}
          />
        )}
        <Button label="Add Members" onClick={() => {}} />
      </div>
      {isVaultInfoLoading ? (
        <></>
      ) : rows.length > 0 ? (
        <div>
          {rows.map((row) => (
            <div key={row.sId}>{row.email}</div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center text-sm font-normal text-element-700">
          No members
        </div>
      )}
    </>
  );
};
