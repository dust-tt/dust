import {
  Button,
  CloudArrowLeftRightIcon,
  Dialog,
  DropdownMenu,
} from "@dust-tt/sparkle";
import type {
  APIError,
  DataSourceViewContentNode,
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
  VaultType,
} from "@dust-tt/types";
import * as _ from "lodash";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useVaults } from "@app/lib/swr/vaults";
import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { LockIcon } from "lucide-react";

interface AddToVaultDialogProps {
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
  contentNode: DataSourceViewContentNode;
}

export const AddToVaultDialog = ({
  dataSourceView,
  isOpen,
  onClose,
  owner,
  contentNode,
}: AddToVaultDialogProps) => {
  const [vault, setVault] = useState<VaultType | undefined>();

  const dataSource = dataSourceView.dataSource;
  const { vaults } = useVaults({ workspaceId: owner.sId });
  const { dataSourceViews } = useDataSourceViews(owner);

  const allViews = dataSourceViews.filter(
    (dsv) => dsv.dataSource.sId === dataSource.sId && dsv.kind !== "default"
  );

  const alreadyInVault = allViews
    .filter(
      (dsv) =>
        !contentNode.parentInternalIds ||
        contentNode.parentInternalIds.some(
          (parentId) => !dsv.parentsIn || dsv.parentsIn.includes(parentId)
        )
    )
    .map((dsv) => dsv.vaultId);

  const availableVaults = vaults.filter((v) => !alreadyInVault.includes(v.sId));

  const addToVault = async () => {
    if (!vault) {
      return "Please select a vault to add the data to.";
    }

    const existingViewForVault = dataSourceViews.find(
      (d) => d.vaultId === vault.sId
    );

    const body = {
      name: dataSource.name,
      parentsIn:
        existingViewForVault && existingViewForVault.parentsIn
          ? [...existingViewForVault.parentsIn, contentNode.internalId]
          : [contentNode.internalId],
    };

    try {
      let res;
      if (existingViewForVault) {
        res = await fetch(
          `/api/w/${owner.sId}/vaults/${vault.sId}/data_source_views/${existingViewForVault.sId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );
      } else {
        res = await fetch(
          `/api/w/${owner.sId}/vaults/${vault.sId}/data_source_views`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );
      }

      if (!res.ok) {
        const rawError: { error: APIError } = await res.json();
        return rawError.error.message;
      }
    } catch (e) {
      return `An Unknown error ${e} occurred while adding data to vault.`;
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onCancel={() => onClose(false)}
      onValidate={addToVault}
      title="Add to vault"
      validateLabel="Save"
    >
      {availableVaults.length === 0 ? (
        <div className="mt-1 text-left">
          This data is already available in all vaults.
        </div>
      ) : (
        <div className="flex w-full flex-col items-center">
          <DropdownMenu>
            <DropdownMenu.Button>
              <Button
                label={vault ? vault.name : "Select vault"}
                variant="primary"
                icon={LockIcon}
                size="sm"
              />
            </DropdownMenu.Button>
            <DropdownMenu.Items>
              {availableVaults.map((currentVault) => (
                <DropdownMenu.Item
                  key={currentVault.sId}
                  label={currentVault.name}
                  onClick={() => setVault(currentVault)}
                />
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
        </div>
      )}
    </Dialog>
  );
};
