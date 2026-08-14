import type {
  SandboxEnvVarFormDialogMode,
  SandboxEnvVarPodOption,
} from "@app/components/sandbox/SandboxEnvVarFormDialog";
import {
  parseAllowedDomainsText,
  SandboxEnvVarFormDialog,
} from "@app/components/sandbox/SandboxEnvVarFormDialog";
import { useComputerAdminAccess } from "@app/hooks/useComputerAdminAccess";
import { SANDBOX_ENV_VAR_PREFIX } from "@app/lib/api/sandbox/env_vars";
import {
  useDeleteSandboxEnvVar,
  usePatchSandboxEnvVar,
  useSandboxEnvVars,
} from "@app/lib/swr/sandbox";
import { timeAgoFrom } from "@app/lib/utils";
import { normalizeEgressPolicyDomains } from "@app/types/sandbox/egress_policy";
import type {
  SandboxEnvVarKind,
  SandboxEnvVarType,
} from "@app/types/sandbox/env_var";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  ContentMessage,
  CubeOutline,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Edit04,
  Globe01,
  InfoCircle,
  Input,
  ListGroup,
  ListItem,
  Lock01,
  Page,
  Plus,
  Spinner,
  Trash01,
} from "@dust-tt/sparkle";
import { useState } from "react";

const ALLOWED_DOMAINS_HELPER_TEXT =
  "Use exact domains such as api.openai.com or wildcards such as *.mistral.ai.";

function labelForKind(kind: SandboxEnvVarKind): string {
  switch (kind) {
    case "config":
      return "Config";
    case "https_secret":
      return "HTTPS secret";
    default:
      assertNeverAndIgnore(kind);
      return "";
  }
}

interface SandboxEnvVarsSectionProps {
  owner: LightWorkspaceType;
  // Present for pod-scoped env vars (pods are project spaces); absent for
  // workspace-scoped ones.
  spaceId?: string;
  // Tie to visibility when the section can be mounted but hidden.
  disabled?: boolean;
  // Central admin page, workspace scope only: enables applying a new
  // variable to specific Pods and the per-row "Override in Pods" action.
  targetablePods?: SandboxEnvVarPodOption[];
}

export function SandboxEnvVarsSection({
  owner,
  spaceId,
  disabled = false,
  targetablePods,
}: SandboxEnvVarsSectionProps) {
  const { isAdmin, isComputerEnabled, canAdministrateComputer } =
    useComputerAdminAccess();
  const [dialogMode, setDialogMode] =
    useState<SandboxEnvVarFormDialogMode | null>(null);
  const [envVarToDelete, setEnvVarToDelete] =
    useState<SandboxEnvVarType | null>(null);
  const [envVarToConfigureDomains, setEnvVarToConfigureDomains] =
    useState<SandboxEnvVarType | null>(null);
  const [domainsText, setDomainsText] = useState("");

  const { envVars, isSandboxEnvVarsLoading, isSandboxEnvVarsError } =
    useSandboxEnvVars({
      owner,
      spaceId,
      disabled: disabled || !canAdministrateComputer,
    });
  const { patchSandboxEnvVar, isPatchingSandboxEnvVar } = usePatchSandboxEnvVar(
    { owner, spaceId }
  );
  const { deleteSandboxEnvVar, isDeletingSandboxEnvVar } =
    useDeleteSandboxEnvVar({ owner, spaceId });

  const domainsDialogParsed = parseAllowedDomainsText(domainsText);
  const domainsDialogNormalized =
    domainsDialogParsed.length > 0
      ? normalizeEgressPolicyDomains(domainsDialogParsed)
      : null;
  const domainsDialogMessage =
    domainsDialogNormalized?.isErr() === true
      ? domainsDialogNormalized.error.message
      : domainsDialogNormalized?.isOk() === true
        ? `Will be saved as ${domainsDialogNormalized.value.join(", ")}.`
        : ALLOWED_DOMAINS_HELPER_TEXT;
  const isDomainsDialogInvalid = domainsDialogNormalized?.isErr() === true;
  const canSaveDomains =
    domainsDialogNormalized?.isOk() === true &&
    domainsDialogNormalized.value.length > 0 &&
    !isPatchingSandboxEnvVar;

  const openConfigureDomainsDialog = (envVar: SandboxEnvVarType) => {
    setDomainsText(envVar.allowedDomains?.join(", ") ?? "");
    setEnvVarToConfigureDomains(envVar);
  };

  const handleConfigureDomains = async () => {
    if (!envVarToConfigureDomains || domainsDialogNormalized?.isOk() !== true) {
      return;
    }

    const success = await patchSandboxEnvVar({
      envVar: envVarToConfigureDomains,
      kind:
        envVarToConfigureDomains.kind === "config" ? "https_secret" : undefined,
      allowedDomains: domainsDialogNormalized.value,
    });
    if (success) {
      setEnvVarToConfigureDomains(null);
      setDomainsText("");
    }
  };

  const handleDelete = async () => {
    if (!envVarToDelete) {
      return;
    }

    const success = await deleteSandboxEnvVar(envVarToDelete);
    if (success) {
      setEnvVarToDelete(null);
    }
  };

  const renderBody = () => {
    if (!isAdmin) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Only workspace admins can manage Computer environment variables.
        </ContentMessage>
      );
    }
    if (!isComputerEnabled) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Computer administration is not enabled for this workspace.
        </ContentMessage>
      );
    }
    if (isSandboxEnvVarsLoading) {
      return <Spinner />;
    }
    if (isSandboxEnvVarsError) {
      return (
        <ContentMessage
          variant="warning"
          icon={InfoCircle}
          size="lg"
          title="Failed to load"
        >
          The Computer environment variables could not be loaded.
        </ContentMessage>
      );
    }

    return (
      <Page.Vertical align="stretch" gap="lg">
        <Page.SectionHeader
          title="Environment variables"
          description={
            spaceId
              ? "Secrets mounted as env vars on every Computer in this Pod. Workspace variables are inherited — a Pod variable with the same name takes precedence. Changes apply to future Computers."
              : "Secrets mounted as env vars on every Computer in this workspace."
          }
        />

        <ContentMessage
          variant="info"
          icon={InfoCircle}
          size="lg"
          title="Choose the right kind for each value"
        >
          <div className="flex flex-col gap-2">
            <div>
              <strong>HTTPS secrets (DSEC_)</strong> — for credentials and
              anything sensitive. Stored encrypted on the host. The dsbx
              forwarder injects the value only into outbound HTTPS requests to
              the domains you whitelist; code running in the Computer never sees
              the raw value. Safe for API keys, tokens, and other secrets bound
              to a known external service.
            </div>
            <div>
              <strong>Config ({SANDBOX_ENV_VAR_PREFIX})</strong> — for
              non-sensitive configuration: feature flags, identifiers, public
              endpoints, model names. Mounted as plain env vars on every new
              Computer and read directly by the agent and the code it runs.
              Anything you put here should be safe to log; do not use for
              credentials.
            </div>
            <div>
              Values are write-only: they cannot be viewed after saving, only
              overwritten or deleted. Env vars are snapshotted when the Computer
              starts: an already-running Computer keeps its original values, and
              any new Computer (new conversation, restart) picks up the latest.
            </div>
          </div>
        </ContentMessage>

        <div className="flex justify-end">
          <Button
            label="Add variable"
            icon={Plus}
            onClick={() => setDialogMode({ kind: "create" })}
          />
        </div>

        {envVars.length === 0 ? (
          <ContentMessage variant="primary" size="lg">
            No environment variables yet.
          </ContentMessage>
        ) : (
          <ListGroup>
            {envVars.map((envVar) => {
              const updatedBy =
                envVar.lastUpdatedByName ?? envVar.createdByName ?? "Unknown";
              const isAnyMutationPending =
                isDeletingSandboxEnvVar || isPatchingSandboxEnvVar;

              return (
                <ListItem key={envVar.name} itemsAlignment="center">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <pre
                      title={envVar.name}
                      className="min-w-0 self-start overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2 text-sm text-foreground"
                    >
                      {envVar.name}
                    </pre>
                    <div className="text-xs text-muted-foreground">
                      Updated{" "}
                      {timeAgoFrom(envVar.updatedAt, { useLongFormat: true })}{" "}
                      ago by {updatedBy}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip
                        size="xs"
                        color={
                          envVar.kind === "https_secret" ? "warning" : "info"
                        }
                        label={labelForKind(envVar.kind)}
                      />
                      {envVar.kind === "https_secret" &&
                        envVar.allowedDomains?.map((domain) => (
                          <Chip
                            key={domain}
                            size="xs"
                            color="primary"
                            label={domain}
                          />
                        ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {targetablePods && !spaceId ? (
                      <Button
                        variant="outline"
                        size="mini"
                        icon={CubeOutline}
                        tooltip={`Override ${envVar.name} in Pods`}
                        disabled={isAnyMutationPending}
                        onClick={() =>
                          setDialogMode({ kind: "override", envVar })
                        }
                      />
                    ) : null}
                    <Button
                      variant="outline"
                      size="mini"
                      icon={envVar.kind === "config" ? Lock01 : Globe01}
                      tooltip={
                        envVar.kind === "config"
                          ? `Promote ${envVar.name} to HTTPS secret`
                          : `Edit allowed domains for ${envVar.name}`
                      }
                      disabled={isAnyMutationPending}
                      onClick={() => openConfigureDomainsDialog(envVar)}
                    />
                    <Button
                      variant="outline"
                      size="mini"
                      icon={Edit04}
                      tooltip={`Replace value of ${envVar.name}`}
                      disabled={isAnyMutationPending}
                      onClick={() => setDialogMode({ kind: "replace", envVar })}
                    />
                    <Button
                      variant="warning"
                      size="mini"
                      icon={Trash01}
                      tooltip={`Delete ${envVar.name}`}
                      disabled={isAnyMutationPending}
                      onClick={() => setEnvVarToDelete(envVar)}
                    />
                  </div>
                </ListItem>
              );
            })}
          </ListGroup>
        )}
      </Page.Vertical>
    );
  };

  return (
    <>
      {dialogMode ? (
        <SandboxEnvVarFormDialog
          owner={owner}
          mode={dialogMode}
          onClose={() => setDialogMode(null)}
          spaceId={spaceId}
          existingEnvVars={envVars}
          podTargeting={
            targetablePods && !spaceId ? { pods: targetablePods } : undefined
          }
        />
      ) : null}

      {envVarToConfigureDomains ? (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setEnvVarToConfigureDomains(null);
              setDomainsText("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {envVarToConfigureDomains.kind === "config"
                  ? `Promote ${envVarToConfigureDomains.name}`
                  : `Allowed domains for ${envVarToConfigureDomains.name}`}
              </DialogTitle>
            </DialogHeader>
            <DialogContainer>
              <Page.Vertical align="stretch" gap="md">
                {envVarToConfigureDomains.kind === "config" ? (
                  <ContentMessage
                    variant="warning"
                    icon={InfoCircle}
                    title="Promotion only takes effect on next wake"
                  >
                    Running Computers keep the previous {SANDBOX_ENV_VAR_PREFIX}
                    -prefixed value in their env until they are restarted. New
                    Computers will receive the promoted secret only via
                    egress-time substitution to the allowed domains.
                  </ContentMessage>
                ) : null}
                <Input
                  label="Allowed domains"
                  name="sandbox-env-var-allowed-domains"
                  placeholder="e.g. api.openai.com, *.mistral.ai"
                  value={domainsText}
                  message={domainsDialogMessage}
                  messageStatus={isDomainsDialogInvalid ? "error" : "info"}
                  disabled={isPatchingSandboxEnvVar}
                  onChange={(event) => setDomainsText(event.target.value)}
                />
              </Page.Vertical>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
                onClick: () => {
                  setEnvVarToConfigureDomains(null);
                  setDomainsText("");
                },
              }}
              rightButtonProps={{
                label:
                  envVarToConfigureDomains.kind === "config"
                    ? "Promote"
                    : "Save",
                icon:
                  envVarToConfigureDomains.kind === "config" ? Lock01 : Globe01,
                onClick: () => {
                  void handleConfigureDomains();
                },
                disabled: !canSaveDomains,
                isLoading: isPatchingSandboxEnvVar,
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {envVarToDelete ? (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setEnvVarToDelete(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {envVarToDelete.name}</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              Are you sure you want to delete{" "}
              <strong>{envVarToDelete.name}</strong>?
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
                onClick: () => setEnvVarToDelete(null),
              }}
              rightButtonProps={{
                label: "Delete",
                variant: "warning",
                onClick: () => {
                  void handleDelete();
                },
                isLoading: isDeletingSandboxEnvVar,
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {renderBody()}
    </>
  );
}
