import { Button, ClipboardCheckIcon, ClipboardIcon } from "@dust-tt/sparkle";
import type { WorkspaceDomain, WorkspaceType } from "@dust-tt/types";
import { useCallback } from "react";

import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { useCopyToClipboard } from "@app/hooks/useCopyToClipboard";

export function WorkspaceInfoTable({
  owner,
  workspaceVerifiedDomain,
  worspaceCreationDay,
}: {
  owner: WorkspaceType;
  workspaceVerifiedDomain: WorkspaceDomain | null;
  worspaceCreationDay: string;
}) {
  const [isCopiedId, copyToClipboardId] = useCopyToClipboard();
  const [isCopiedSid, copyToClipboardSid] = useCopyToClipboard();

  return (
    <div className="flex justify-between gap-3 pt-4">
      <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-md flex-grow pb-4 font-bold">Workspace info:</h2>
        </div>
        <PokeTable>
          <PokeTableBody>
            <PokeTableRow>
              <PokeTableCell>Id</PokeTableCell>
              <PokeTableCell>
                {owner.id}
                &nbsp;
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={useCallback(
                    async (e: any) => {
                      e.preventDefault();
                      await copyToClipboardId(owner.id);
                    },
                    [copyToClipboardId, owner.id]
                  )}
                  label="Copy"
                  labelVisible={false}
                  icon={isCopiedId ? ClipboardCheckIcon : ClipboardIcon}
                />
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>sId</PokeTableCell>
              <PokeTableCell>
                {owner.sId}
                &nbsp;
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={useCallback(
                    async (e: any) => {
                      e.preventDefault();
                      await copyToClipboardSid(owner.sId);
                    },
                    [copyToClipboardSid, owner.sId]
                  )}
                  label="Copy"
                  labelVisible={false}
                  icon={isCopiedSid ? ClipboardCheckIcon : ClipboardIcon}
                />
              </PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Creation</PokeTableCell>
              <PokeTableCell>{worspaceCreationDay}</PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>SSO Enforced</PokeTableCell>
              <PokeTableCell>{owner.ssoEnforced ? "✅" : "❌"}</PokeTableCell>
            </PokeTableRow>
            <PokeTableRow>
              <PokeTableCell>Auto Join</PokeTableCell>
              <PokeTableCell>
                {workspaceVerifiedDomain?.domainAutoJoinEnabled ? "✅" : "❌"}
              </PokeTableCell>
              <PokeTableCell>{workspaceVerifiedDomain?.domain}</PokeTableCell>
            </PokeTableRow>
          </PokeTableBody>
        </PokeTable>
      </div>
    </div>
  );
}
