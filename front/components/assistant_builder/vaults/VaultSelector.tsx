import { Chip, Icon, Page, RadioButton, Spinner } from "@dust-tt/sparkle";
import type { LightWorkspaceType, VaultType } from "@dust-tt/types";
import { useState } from "react";

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

  if (isVaultsLoading || isVaultsError) {
    return <Spinner />;
  }

  const shouldRenderDirectly = !allowedVaults || vaults.length === 1;
  const selectedVaultObj = vaults.find((v) => v.sId === selectedVault);

  return (
    <div>
      {shouldRenderDirectly
        ? renderChildren(allowedVaults ? allowedVaults[0] : undefined)
        : vaults.map((vault) => {
            const isDisabled = !allowedVaults?.some((v) => v.sId === vault.sId);

            return (
              <div key={vault.sId}>
                <Page.Separator />
                <RadioButton
                  name={`Vault ${vault.name}`}
                  choices={[
                    {
                      label: (
                        <>
                          <Icon
                            visual={getVaultIcon(vault)}
                            size="md"
                            className="ml-3 mr-2 inline-block flex-shrink-0 align-middle text-brand"
                          />
                          <span
                            className={classNames(
                              "text-element-900",
                              "align-middle",
                              !isDisabled ? "font-bold" : "italic"
                            )}
                          >
                            {getVaultName(vault)}
                            {isDisabled && (
                              <Chip
                                size="xs"
                                className="ml-2"
                                label="Disabled: only one vault allowed per assistant"
                                color="warning"
                              />
                            )}
                          </span>
                        </>
                      ),
                      value: vault.sId,
                      disabled: isDisabled,
                    },
                  ]}
                  value={selectedVault}
                  onChange={() => setSelectedVault(vault.sId)}
                />
                {selectedVault === vault.sId && (
                  <div className="m-2">{renderChildren(selectedVaultObj)}</div>
                )}
              </div>
            );
          })}
      <Page.Separator />
    </div>
  );
}
