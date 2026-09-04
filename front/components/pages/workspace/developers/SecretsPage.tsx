import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { useDustAppSecrets } from "@app/lib/swr/apps";
import type { DustAppSecretType } from "@app/types/dust_app_secret";
import {
  BookOpen01,
  Button,
  DataTable,
  DataTableLoadingSkeleton,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Edit04,
  Input,
  Page,
  Plus,
  SearchInput,
  Trash01,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { useSWRConfig } from "swr";

interface SecretRowData {
  name: string;
  isActionDisabled: boolean;
  onClick?: () => void;
  onDelete?: () => void;
}

const columns: ColumnDef<SecretRowData>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: (info: CellContext<SecretRowData, unknown>) => (
      <DataTable.CellContent grow>
        <DataTable.CellContentWithCopy
          textToCopy={`env.secrets.${info.row.original.name}`}
        >
          <span className="font-mono">
            env.secrets.{info.row.original.name}
          </span>
        </DataTable.CellContentWithCopy>
      </DataTable.CellContent>
    ),
    meta: { className: "w-full" },
  },
  {
    id: "actions",
    header: "",
    cell: (info: CellContext<SecretRowData, unknown>) => {
      const { isActionDisabled, onClick, onDelete } = info.row.original;
      if (!onClick || !onDelete) {
        return null;
      }

      return (
        <DataTable.CellContent>
          <div className="flex gap-1 opacity-0 focus-within:opacity-100 group-hover/dt-row:opacity-100">
            <Button
              size="xs"
              variant="ghost"
              icon={Edit04}
              tooltip="Edit"
              disabled={isActionDisabled}
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            />
            <Button
              size="xs"
              variant="warning-ghost"
              icon={Trash01}
              tooltip="Delete"
              disabled={isActionDisabled}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            />
          </div>
        </DataTable.CellContent>
      );
    },
    meta: { className: "w-20" },
  },
];

export function SecretsPage() {
  const owner = useWorkspace();
  const { isAdmin } = useAuth();

  const { mutate } = useSWRConfig();
  const defaultSecret = { name: "", value: "" };
  const [newDustAppSecret, setNewDustAppSecret] =
    useState<DustAppSecretType>(defaultSecret);
  const [secretToRevoke, setSecretToRevoke] =
    useState<DustAppSecretType | null>(null);
  const [isNewSecretPromptOpen, setIsNewSecretPromptOpen] = useState(false);
  const [isInputNameDisabled, setIsInputNameDisabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const sendNotification = useSendNotification();

  const { secrets, isSecretsLoading, isSecretsError } =
    useDustAppSecrets(owner);

  const { submit: handleGenerate, isSubmitting: isGenerating } =
    useSubmitFunction(async (secret: DustAppSecretType) => {
      const r = await clientFetch(`/api/w/${owner.sId}/dust_app_secrets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: secret.name, value: secret.value }),
      });
      if (r.ok) {
        await mutate(`/api/w/${owner.sId}/dust_app_secrets`);
        setIsNewSecretPromptOpen(false);
        setNewDustAppSecret(defaultSecret);
        sendNotification({
          type: "success",
          title: "Secret saved",
          description: "Successfully saved the secret value securely.",
        });
      } else {
        const msg = await r.text();
        sendNotification({
          type: "error",
          title: "Error saving secret",
          description: `An error occurred while saving the secret value: ${msg}`,
        });
      }
    });

  const { submit: handleRevoke, isSubmitting: isRevoking } = useSubmitFunction(
    async (secret: DustAppSecretType) => {
      await clientFetch(
        `/api/w/${owner.sId}/dust_app_secrets/${secret.name}/destroy`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      await mutate(`/api/w/${owner.sId}/dust_app_secrets`);
      setSecretToRevoke(null);
      sendNotification({
        type: "success",
        title: "Secret deleted",
        description: `Successfully deleted ${secret.name}.`,
      });
    }
  );

  const cleanSecretName = (name: string) => {
    return name.replace(/[^a-zA-Z0-9_]/g, "").toUpperCase();
  };

  const handleUpdate = (secret: DustAppSecretType) => {
    setNewDustAppSecret({ ...secret, value: "" });
    setIsNewSecretPromptOpen(true);
    setIsInputNameDisabled(true);
  };

  const rows: SecretRowData[] = [...secrets]
    .filter((secret) =>
      secret.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((secret) => ({
      name: secret.name,
      isActionDisabled: isGenerating || isRevoking,
      onClick: isAdmin ? () => handleUpdate(secret) : undefined,
      onDelete: isAdmin ? () => setSecretToRevoke(secret) : undefined,
    }));

  return (
    <AdminPageContainer>
      <>
        {secretToRevoke ? (
          <Dialog
            open={true}
            onOpenChange={(open) => {
              if (!open) {
                setSecretToRevoke(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {secretToRevoke?.name}</DialogTitle>
              </DialogHeader>
              <DialogContainer>
                Are you sure you want to delete the secret{" "}
                <strong>{secretToRevoke?.name}</strong>?
              </DialogContainer>
              <DialogFooter
                leftButtonProps={{
                  label: "Cancel",
                  variant: "outline",
                  onClick: () => setSecretToRevoke(null),
                }}
                rightButtonProps={{
                  label: "Delete",
                  variant: "warning",
                  onClick: () => handleRevoke(secretToRevoke),
                }}
              />
            </DialogContent>
          </Dialog>
        ) : null}
        <Dialog
          open={isNewSecretPromptOpen}
          onOpenChange={(open) => {
            if (!open) {
              setIsNewSecretPromptOpen(false);
            }
          }}
        >
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>
                {isInputNameDisabled ? "Update" : "New"} Developer Secret
              </DialogTitle>
            </DialogHeader>
            <DialogContainer>
              <Input
                message="Secret names must be alphanumeric and underscore characters only."
                name="Secret Name"
                placeholder="SECRET_NAME"
                value={newDustAppSecret.name}
                disabled={isInputNameDisabled}
                onChange={(e) =>
                  setNewDustAppSecret({
                    ...newDustAppSecret,
                    name: cleanSecretName(e.target.value),
                  })
                }
              />
              <Input
                // prevent autocompletion of secrets
                autoComplete="off"
                message="Secret values are encrypted and stored securely in our database."
                name="Secret value"
                placeholder="Type the secret value"
                value={newDustAppSecret.value}
                onChange={(e) =>
                  setNewDustAppSecret({
                    ...newDustAppSecret,
                    value: e.target.value,
                  })
                }
              />
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
                onClick: () => setIsNewSecretPromptOpen(false),
              }}
              rightButtonProps={{
                label: isInputNameDisabled ? "Update" : "Create",
                variant: "primary",
                onClick: () => handleGenerate(newDustAppSecret),
              }}
            />
          </DialogContent>
        </Dialog>

        <Page.Vertical gap="xl" align="stretch">
          <Page.Header
            title="Developer Secrets"
            description="Secrets usable in Dust apps or MCP servers to safely store sensitive data."
          />
          <Page.Vertical align="stretch" gap="md">
            <div className="flex items-center gap-2">
              <SearchInput
                className="flex-grow"
                name="secrets-search"
                placeholder="Search secrets"
                value={searchQuery}
                onChange={setSearchQuery}
              />
              <Button
                label="Read the API reference"
                size="sm"
                variant="outline"
                icon={BookOpen01}
                onClick={() => {
                  window.open(
                    "https://docs.dust.tt/reference/developer-platform-overview#developer-secrets",
                    "_blank"
                  );
                }}
              />
              {isAdmin && (
                <Button
                  label="Create Secret"
                  variant="primary"
                  onClick={() => {
                    setNewDustAppSecret(defaultSecret);
                    setIsInputNameDisabled(false);
                    setIsNewSecretPromptOpen(true);
                  }}
                  icon={Plus}
                  disabled={isGenerating || isRevoking}
                />
              )}
            </div>
            <SecretsTable
              isLoading={isSecretsLoading}
              isError={!!isSecretsError}
              rows={rows}
              searchQuery={searchQuery}
            />
          </Page.Vertical>
        </Page.Vertical>
        <div className="h-12" />
      </>
    </AdminPageContainer>
  );
}

interface SecretsTableProps {
  isLoading: boolean;
  isError: boolean;
  rows: SecretRowData[];
  searchQuery: string;
}

function SecretsTable({
  isLoading,
  isError,
  rows,
  searchQuery,
}: SecretsTableProps) {
  if (isLoading) {
    return <DataTableLoadingSkeleton showSelectionColumn={false} />;
  }

  if (isError) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        Failed to load secrets.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        {searchQuery ? "No matching secrets found" : "No secrets created yet."}
      </p>
    );
  }

  return <DataTable data={rows} columns={columns} />;
}
