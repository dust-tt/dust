import { Chip, Icon, RadioButton, Spinner } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightWorkspaceType,
  VaultType,
} from "@dust-tt/types";
import { groupBy } from "lodash";
import { useMemo, useState } from "react";

import { useVaults } from "@app/lib/swr/vaults";
import { classNames } from "@app/lib/utils";
import { getVaultIcon, getVaultName } from "@app/lib/vaults";

interface VaultSelctorProps {
  owner: LightWorkspaceType;
  dataSourceViews: DataSourceViewType[];
  allowedVaults?: VaultType[];
  defaultVault: string;
  renderChildren: (dataSourceViews: DataSourceViewType[]) => React.ReactNode;
}

export function VaultSelector({
  owner,
  dataSourceViews,
  allowedVaults,
  defaultVault,
  renderChildren,
}: VaultSelctorProps) {
  const dataSourceViewsByVaultId = useMemo(
    () => groupBy(dataSourceViews, (dsv) => dsv.vaultId),
    [dataSourceViews]
  );

  const { vaults, isVaultsError, isVaultsLoading } = useVaults({
    workspaceId: owner.sId,
  });

  const [selectedVault, setSelectedVault] = useState<string>(defaultVault);

  if (isVaultsLoading || isVaultsError) {
    return <Spinner />;
  }

  if (Object.keys(dataSourceViewsByVaultId).length === 1) {
    return renderChildren(dataSourceViews);
  } else {
    return (
      <div>
        <div className="h-px w-full bg-structure-200" />
        {Object.keys(dataSourceViewsByVaultId).map((vaultId) => {
          const vault = vaults.find((v) => v.sId === vaultId);
          if (!vault) {
            // Should never happen
            return null;
          }
          const disabled = !(allowedVaults
            ? allowedVaults.find((v) => v.sId === vaultId)
            : false);
          return (
            <>
              <div key={vaultId} className="py-2">
                <RadioButton
                  name={`Vault ${vaultId}`}
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
                              !disabled ? "font-bold" : "italic"
                            )}
                          >
                            {getVaultName(vault)}{" "}
                            {disabled && (
                              <Chip
                                key="xs-warning"
                                size="xs"
                                className="ml-2"
                                label="Disabled: only one vault allowed per assistant"
                                color="warning"
                              />
                            )}
                          </span>
                        </>
                      ),
                      value: vaultId,
                      disabled: disabled,
                    },
                  ]}
                  value={selectedVault}
                  onChange={() => setSelectedVault(vaultId)}
                />
              </div>
              {selectedVault === vaultId && (
                <div className="mb-2">
                  {renderChildren(dataSourceViewsByVaultId[vaultId])}
                </div>
              )}

              <div className="h-px w-full bg-structure-200" />
            </>
          );
        })}
      </div>
    );
  }
}
