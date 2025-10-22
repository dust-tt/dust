import { Button, Card, DataTable, Spinner } from "@dust-tt/sparkle";
import { KeyIcon, PencilIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";
import sortBy from "lodash/sortBy";
import React, { useMemo } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import { useDustAppSecrets } from "@app/lib/swr/apps";
import type { DustAppSecretType } from "@app/types";

interface SecretTableData extends DustAppSecretType {
  onClick: () => void;
}

interface SecretSelectionTableProps {
  tableData: SecretTableData[];
  columns: ColumnDef<SecretTableData>[];
}

function SecretSelectionTable({
  tableData,
  columns,
}: SecretSelectionTableProps) {
  return (
    <div className="flex h-full flex-col">
      <DataTable
        data={tableData}
        columns={columns}
        className="h-full"
        filterColumn="name"
      />
    </div>
  );
}

export function SecretSection() {
  const { owner } = useAgentBuilderContext();
  const { field, fieldState } = useController<
    MCPFormData,
    "configuration.secretName"
  >({
    name: "configuration.secretName",
  });

  const { secrets, isSecretsLoading, isSecretsError } =
    useDustAppSecrets(owner);

  const availableSecrets = useMemo(() => sortBy(secrets, "name"), [secrets]);

  const handleRowClick = (secret: DustAppSecretType) => {
    field.onChange(secret.name);
  };

  const handleEditClick = () => {
    field.onChange(null);
  };

  const tableData: SecretTableData[] = availableSecrets.map((secret) => ({
    ...secret,
    onClick: () => handleRowClick(secret),
  }));

  const columns: ColumnDef<SecretTableData>[] = [
    {
      id: "name",
      accessorKey: "name",
      cell: ({ row }) => (
        <DataTable.CellContent icon={KeyIcon}>
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium">{row.original.name}</div>
          </div>
        </DataTable.CellContent>
      ),
      meta: {
        sizeRatio: 100,
      },
    },
  ];

  if (isSecretsLoading) {
    return (
      <ConfigurationSectionContainer
        title="Select a Secret"
        error={fieldState.error?.message}
      >
        <div className="flex h-40 w-full items-center justify-center">
          <Spinner />
        </div>
      </ConfigurationSectionContainer>
    );
  }

  if (isSecretsError) {
    return (
      <ConfigurationSectionContainer
        title="Select a Secret"
        error={`Failed to load secrets: ${isSecretsError}`}
      >
        <div className="flex h-40 w-full items-center justify-center text-red-500">
          Error loading secrets
        </div>
      </ConfigurationSectionContainer>
    );
  }

  return (
    <ConfigurationSectionContainer
      title="Select a Secret"
      error={fieldState.error?.message}
    >
      <div className="flex h-full flex-col gap-3">
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          The agent will use the selected secret to authenticate with the
          service. The secret value will be securely injected at runtime.
        </div>

        {field.value ? (
          <Card className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <KeyIcon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{field.value}</div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={PencilIcon}
                onClick={handleEditClick}
                label="Change"
              />
            </div>
          </Card>
        ) : (
          <>
            {availableSecrets.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
                <KeyIcon className="h-8 w-8 text-muted-foreground" />
                <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  No secrets found. Create a secret in your workspace settings
                  first.
                </div>
              </div>
            ) : (
              <div className="flex h-64 flex-col">
                <SecretSelectionTable tableData={tableData} columns={columns} />
              </div>
            )}
          </>
        )}
      </div>
    </ConfigurationSectionContainer>
  );
}
