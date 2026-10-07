import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { compareStrings } from "@app/lib/i18n/format";
import { useDustAppSecrets } from "@app/lib/swr/apps";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { DustAppSecretType } from "@app/types/dust_app_secret";
import type { DataTableSkeletonCellProps } from "@dust-tt/sparkle";
import {
  BookOpen01,
  Button,
  cn,
  DataTable,
  DataTableSkeleton,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Edit04,
  Input,
  LoadingBlock,
  Page,
  Plus,
  SearchInput,
  Trash01,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useSWRConfig } from "swr";

interface SecretRowData {
  name: string;
  isActionDisabled: boolean;
  onClick?: () => void;
  onDelete?: () => void;
}

export function SecretsPage() {
  const { t } = useLingui();

  return (
    <AdminPageContainer>
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title={t`Developer Secrets`}
          description={t`Secrets usable in Dust apps or MCP servers to safely store sensitive data.`}
        />
        <SecretsPageContent />
      </Page.Vertical>
    </AdminPageContainer>
  );
}

export function SecretsPageContent() {
  const { t } = useLingui();
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
  const sendApiErrorNotification = useSendApiErrorNotification();
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
          title: t`Secret saved`,
          description: t`Successfully saved the secret value securely.`,
        });
      } else {
        const errorData = await getErrorFromResponse(r);
        sendApiErrorNotification({
          title: t`Error saving secret`,
          error: errorData,
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
      const secretName = secret.name;
      sendNotification({
        type: "success",
        title: t`Secret deleted`,
        description: t`Successfully deleted ${secretName}.`,
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
    .sort((a, b) => compareStrings(a.name, b.name))
    .map((secret) => ({
      name: secret.name,
      isActionDisabled: isGenerating || isRevoking,
      onClick: isAdmin ? () => handleUpdate(secret) : undefined,
      onDelete: isAdmin ? () => setSecretToRevoke(secret) : undefined,
    }));

  const secretToRevokeName = secretToRevoke?.name;

  return (
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
              <DialogTitle>
                <Trans>Delete {secretToRevokeName}</Trans>
              </DialogTitle>
            </DialogHeader>
            <DialogContainer>
              <Trans>
                Are you sure you want to delete the secret{" "}
                <strong>{secretToRevokeName}</strong>?
              </Trans>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: t`Cancel`,
                variant: "outline",
                onClick: () => setSecretToRevoke(null),
              }}
              rightButtonProps={{
                label: t`Delete`,
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
              {isInputNameDisabled ? (
                <Trans>Update Developer Secret</Trans>
              ) : (
                <Trans>New Developer Secret</Trans>
              )}
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <Input
              message={t`Secret names must be alphanumeric and underscore characters only.`}
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
              message={t`Secret values are encrypted and stored securely in our database.`}
              name="Secret value"
              placeholder={t`Type the secret value`}
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
              label: t`Cancel`,
              variant: "outline",
              onClick: () => setIsNewSecretPromptOpen(false),
            }}
            rightButtonProps={{
              label: isInputNameDisabled ? t`Update` : t`Create`,
              variant: "primary",
              onClick: () => handleGenerate(newDustAppSecret),
            }}
          />
        </DialogContent>
      </Dialog>

      <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.secrets.secrets}>
        <Page.Vertical align="stretch" gap="md">
          <div className="flex items-center gap-2">
            <SearchInput
              className="flex-grow"
              name="secrets-search"
              placeholder={t`Search secrets`}
              value={searchQuery}
              onChange={setSearchQuery}
            />
            <Button
              label={t`API Reference`}
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
                label={t`Create Secret`}
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
      </AdminSectionAnchor>
      <div className="h-12" />
    </>
  );
}

interface SecretsTableProps {
  isLoading: boolean;
  isError: boolean;
  rows: SecretRowData[];
  searchQuery: string;
}

function SecretSkeletonCell({
  columnId,
  rowIndex,
}: DataTableSkeletonCellProps) {
  switch (columnId) {
    case "name":
      return (
        <div className="flex items-center gap-2">
          <LoadingBlock
            className={cn(
              "h-3 max-w-full",
              ["w-56", "w-64", "w-48", "w-60", "w-52"][rowIndex % 5]
            )}
          />
          <LoadingBlock className="h-6 w-6 shrink-0 rounded-lg" />
        </div>
      );
    case "actions":
      // Edit and delete only appear on hover in the loaded table.
      return null;
    default:
      return null;
  }
}

function SecretsTable({
  isLoading,
  isError,
  rows,
  searchQuery,
}: SecretsTableProps) {
  const { t } = useLingui();
  const columns = useMemo<ColumnDef<SecretRowData>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
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
                  tooltip={t`Edit`}
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
                  tooltip={t`Delete`}
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
    ],
    [t]
  );

  if (isLoading) {
    return (
      <DataTableSkeleton columns={columns} SkeletonCell={SecretSkeletonCell} />
    );
  }

  if (isError) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        <Trans>Failed to load secrets.</Trans>
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        {searchQuery ? (
          <Trans>No matching secrets found</Trans>
        ) : (
          <Trans>No secrets created yet.</Trans>
        )}
      </p>
    );
  }

  return <DataTable data={rows} columns={columns} />;
}
