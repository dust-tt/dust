import { Button, Dialog, DropdownMenu } from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type {
  APIError,
  DataSourceViewContentNode,
  DataSourceViewType,
  LightWorkspaceType,
  SpaceType,
} from "@dust-tt/types";
import { useEffect, useState } from "react";

import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { useVaults } from "@app/lib/swr/vaults";

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
  const [vault, setVault] = useState<SpaceType | undefined>();

  const dataSource = dataSourceView.dataSource;
  const { vaults } = useVaults({ workspaceId: owner.sId });
  const { dataSourceViews, mutateDataSourceViews } = useDataSourceViews(owner);

  const sendNotification = useSendNotification();

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
    .map((dsv) => dsv.spaceId);

  const availableVaults = vaults.filter((v) => !alreadyInVault.includes(v.sId));

  useEffect(() => {
    if (isOpen) {
      setVault(undefined);
    }
  }, [isOpen]);

  const addToVault = async () => {
    if (!vault) {
      return "Please select a space to add the data to.";
    }

    const existingViewForVault = dataSourceViews.find(
      (d) => d.spaceId === vault.sId && d.dataSource.sId === dataSource.sId
    );

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
            body: JSON.stringify({
              parentsToAdd: [contentNode.internalId],
            }),
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
            body: JSON.stringify({
              dataSourceId: dataSource.sId,
              parentsIn: [contentNode.internalId],
            }),
          }
        );
      }

      if (!res.ok) {
        const rawError: { error: APIError } = await res.json();
        sendNotification({
          title: `Error while adding data to space`,
          description: rawError.error.message,
          type: "error",
        });
        onClose(false);
      } else {
        sendNotification({
          title: `Data added to space`,
          type: "success",
        });
        onClose(true);
        await mutateDataSourceViews();
      }
    } catch (e) {
      sendNotification({
        title: `Error while adding data to space`,
        description: `An Unknown error ${e} occurred while adding data to space.`,
        type: "error",
      });
      onClose(false);
    }
  };

  return (
    <Dialog
      disabled={vault === undefined}
      isOpen={isOpen}
      onCancel={() => onClose(false)}
      onValidate={addToVault}
      title="Add to Space"
      validateLabel="Save"
    >
      {availableVaults.length === 0 ? (
        <div className="mt-1 text-left">
          This data is already available in all spaces.
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenu.Button>
            <Button
              hasMagnifying={false}
              label={vault ? vault.name : "Select space"}
              size="sm"
              isSelect
              variant="outline"
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
      )}
    </Dialog>
  );
};
