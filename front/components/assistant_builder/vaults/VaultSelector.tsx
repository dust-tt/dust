import {
  Dialog,
  Icon,
  RadioGroup,
  RadioGroupChoice,
  Separator,
} from "@dust-tt/sparkle";
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
    .filter((i) => i.section !== "system")
    .map((i) =>
      i.vaults.sort((a, b) => {
        return a.name.localeCompare(b.name);
      })
    )
    .flat();

  return (
    <>
      <RadioGroup
        value={selectedVault}
        onValueChange={(value) => setSelectedVault(value)}
      >
        {sortedVaults.map((vault, index) => {
          const isDisabled =
            allowedVaults && !allowedVaults.some((v) => v.sId === vault.sId);

          return (
            <React.Fragment key={vault.sId}>
              {index > 0 && <Separator />}
              <div key={vault.sId} className="py-2">
                <RadioGroupChoice
                  value={vault.sId}
                  disabled={isDisabled}
                  iconPosition="start"
                  onClick={() => {
                    if (isDisabled) {
                      setAlertIsDialogOpen(true);
                    }
                  }}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1 pl-2">
                      <Icon
                        visual={getVaultIcon(vault)}
                        size="md"
                        className={classNames(
                          "inline-block flex-shrink-0 align-middle",
                          isDisabled ? "text-element-700" : ""
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
                    {selectedVault === vault.sId && (
                      <div className="ml-4 mt-1">
                        {renderChildren(selectedVaultObj)}
                      </div>
                    )}
                  </div>
                </RadioGroupChoice>
              </div>
            </React.Fragment>
          );
        })}
      </RadioGroup>
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
