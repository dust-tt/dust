import { Checkbox, Dialog, Icon, Separator } from "@dust-tt/sparkle";
import type { VaultType } from "@dust-tt/types";
import React, { useState } from "react";

import { classNames } from "@app/lib/utils";
import { getVaultIcon, getVaultName, groupVaults } from "@app/lib/vaults";

interface VaultSelectorProps {
  allowedVaults?: VaultType[];
  defaultVault: string | undefined;
  vaults: VaultType[];
  renderChildren: (vault?: VaultType) => React.ReactNode;
}
export function VaultSelector({
  allowedVaults,
  defaultVault,
  renderChildren,
  vaults,
}: VaultSelectorProps) {
  const [selectedVault, setSelectedVault] = useState<string | undefined>(
    defaultVault
  );
  const [isAlertDialogOpen, setAlertIsDialogOpen] = useState(false);

  const shouldRenderDirectly = vaults.length === 1;
  const selectedVaultObj = vaults.find((v) => v.sId === selectedVault);

  if (shouldRenderDirectly) {
    if (allowedVaults && !allowedVaults.some((v) => v.sId === vaults[0].sId)) {
      return renderChildren(undefined);
    }
    return renderChildren(vaults[0]);
  }

  // Group by kind and sort.
  const sortedVaults = groupVaults(vaults)
    .filter((i) => i.kind !== "system")
    .map((i) =>
      i.vaults.sort((a, b) => {
        return a.name.localeCompare(b.name);
      })
    )
    .flat();
  // TODO: we are using Checkboxes here as our RadioButton isn't flexible
  // enough to allow a onClick callback on a disabled item and to render
  // elements in between labels. We are aiming to refactor RadioButton
  return (
    <>
      {sortedVaults.map((vault, index) => {
        const isDisabled =
          allowedVaults && !allowedVaults.some((v) => v.sId === vault.sId);
        const isChecked = selectedVault === vault.sId;

        return (
          <div key={vault.sId}>
            {index > 0 && <Separator />}
            <div
              className="flex items-center py-2"
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
      <Separator />
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
