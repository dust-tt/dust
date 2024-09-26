import { Checkbox, Dialog, Icon, Page, Spinner } from "@dust-tt/sparkle";
import type { LightWorkspaceType, VaultType } from "@dust-tt/types";
import React, { useState } from "react";

import { useVaults } from "@app/lib/swr/vaults";
import { classNames } from "@app/lib/utils";
import { getVaultIcon, getVaultName } from "@app/lib/vaults";

interface VaultSelectorProps {
  owner: LightWorkspaceType;
  allowedVaults?: VaultType[];
  defaultVault: string;
  renderChildren: (vault?: VaultType) => React.ReactNode;
}
export function VaultSelector({
  owner,
  allowedVaults,
  defaultVault,
  renderChildren,
}: VaultSelectorProps) {
  const { vaults, isVaultsError, isVaultsLoading } = useVaults({
    workspaceId: owner.sId,
  });
  const [selectedVault, setSelectedVault] = useState<string>(defaultVault);
  const [isAlertDialogOpen, setAlertIsDialogOpen] = useState(false);

  if (isVaultsLoading || isVaultsError) {
    return <Spinner />;
  }

  const shouldRenderDirectly = !allowedVaults || vaults.length === 1;
  const selectedVaultObj = vaults.find((v) => v.sId === selectedVault);

  if (shouldRenderDirectly) {
    return renderChildren(allowedVaults ? allowedVaults[0] : undefined);
  }

  // TODO: we are using Checkboxes here as our RadioButton isn't flexible
  // enough to allow a onClick callback on a disabled item and to render
  // elements in between labels. We are aiming to refactor RadioButton
  return (
    <>
      {vaults.map((vault) => {
        const isDisabled = !allowedVaults?.some((v) => v.sId === vault.sId);
        const isChecked = selectedVault === vault.sId;

        return (
          <div key={vault.sId}>
            <Page.Separator />
            <div
              className="flex items-center gap-2"
              onClick={() => {
                if (isDisabled) {
                  setAlertIsDialogOpen(true);
                }
              }}
            >
              <Checkbox
                variant="checkable"
                checked={isChecked ? "checked" : "unchecked"}
                onChange={() => {
                  if (!isDisabled) {
                    setSelectedVault(isChecked ? "" : vault.sId);
                  }
                }}
                disabled={isDisabled}
              />
              <div className="flex items-center gap-2">
                <Icon
                  visual={getVaultIcon(vault)}
                  size="md"
                  className={classNames(
                    "ml-3 mr-2 inline-block flex-shrink-0 align-middle",
                    isDisabled ? "text-element-700" : "text-brand"
                  )}
                />
                <span
                  className={classNames(
                    "font-bold",
                    "align-middle",
                    isDisabled ? "text-element-700" : "text-element-900"
                  )}
                >
                  {getVaultName(vault)}
                </span>
              </div>
            </div>
            {isChecked && (
              <div className="ml-8 mt-2">
                {renderChildren(selectedVaultObj)}
              </div>
            )}
          </div>
        );
      })}
      <Page.Separator />
      <Dialog
        alertDialog={true}
        isOpen={isAlertDialogOpen}
        onValidate={() => setAlertIsDialogOpen(false)}
        title="Changing source selection"
      >
        An assistant can access one source of data only. The other tools are
        using a different source.
      </Dialog>
    </>
  );
}
