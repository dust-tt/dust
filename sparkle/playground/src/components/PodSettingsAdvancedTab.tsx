import {
  Button,
  Chip,
  ContentMessage,
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
  Plus,
  SliderToggle,
  TextArea,
  Trash01,
} from "@dust-tt/sparkle";
import { useState } from "react";

import type { PodEnvVar, PodEnvVarKind } from "../data";

function envVarKindLabel(kind: PodEnvVarKind): string {
  return kind === "https_secret" ? "HTTPS secret" : "Config";
}

export interface PodSettingsAdvancedTabProps {
  allowedDomains: string[];
  onAllowedDomainsChange: (domains: string[]) => void;
  requestedDomains: string[];
  onRequestedDomainsChange: (domains: string[]) => void;
  envVars: PodEnvVar[];
  onEnvVarsChange: (envVars: PodEnvVar[]) => void;
}

export function PodSettingsAdvancedTab({
  allowedDomains,
  onAllowedDomainsChange,
  requestedDomains,
  onRequestedDomainsChange,
  envVars,
  onEnvVarsChange,
}: PodSettingsAdvancedTabProps) {
  // ── Network ─────────────────────────────────────────────────────────────
  const [domainDraft, setDomainDraft] = useState("");

  // ── Environment variables ───────────────────────────────────────────────
  const [isEnvVarDialogOpen, setIsEnvVarDialogOpen] = useState(false);
  const [envVarNameDraft, setEnvVarNameDraft] = useState("");
  const [envVarValueDraft, setEnvVarValueDraft] = useState("");
  const [envVarIsSecret, setEnvVarIsSecret] = useState(false);
  const [envVarDomainsDraft, setEnvVarDomainsDraft] = useState("");
  const [envVarToDelete, setEnvVarToDelete] = useState<PodEnvVar | null>(null);

  const pendingDomainRequests = requestedDomains.filter(
    (domain) => !allowedDomains.includes(domain)
  );
  const normalizedDomainDraft = domainDraft.trim().toLowerCase();
  const isDomainDraftDuplicate =
    normalizedDomainDraft.length > 0 &&
    allowedDomains.includes(normalizedDomainDraft);

  const handleAddDomain = () => {
    if (normalizedDomainDraft.length === 0 || isDomainDraftDuplicate) {
      return;
    }
    onAllowedDomainsChange([...allowedDomains, normalizedDomainDraft]);
    setDomainDraft("");
  };

  const closeEnvVarDialog = () => {
    setIsEnvVarDialogOpen(false);
    setEnvVarNameDraft("");
    setEnvVarValueDraft("");
    setEnvVarIsSecret(false);
    setEnvVarDomainsDraft("");
  };

  const handleSaveEnvVar = () => {
    const kind: PodEnvVarKind = envVarIsSecret ? "https_secret" : "config";
    const prefix = envVarIsSecret ? "DSEC_" : "DUST_SANDBOX_";
    const allowed = envVarDomainsDraft
      .split(",")
      .map((domain) => domain.trim())
      .filter((domain) => domain.length > 0);

    onEnvVarsChange([
      ...envVars,
      {
        name: `${prefix}${envVarNameDraft.trim().toUpperCase()}`,
        kind,
        allowedDomains: kind === "https_secret" ? allowed : undefined,
        updatedAgo: "a few seconds",
        updatedBy: "You",
      },
    ]);
    closeEnvVarDialog();
  };

  const canSaveEnvVar =
    envVarNameDraft.trim().length > 0 &&
    envVarValueDraft.trim().length > 0 &&
    (!envVarIsSecret || envVarDomainsDraft.trim().length > 0);

  return (
    <>
      {/* Network */}
      <div className="flex w-full flex-col gap-4">
        <div className="heading-lg">Network</div>
        <p className="text-sm text-muted-foreground">
          Domains this Pod's Computer can reach, in addition to those allowed
          across your workspace. Changes reach running Computers within a
          minute.
        </p>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            handleAddDomain();
          }}
        >
          <div className="grow">
            <Input
              label="Domain"
              name="domain"
              placeholder="api.openai.com or *.mistral.ai"
              value={domainDraft}
              message={
                isDomainDraftDuplicate
                  ? "This domain is already allowed."
                  : "A wildcard covers subdomains only. *.mistral.ai allows api.mistral.ai, not mistral.ai."
              }
              messageStatus={isDomainDraftDuplicate ? "error" : "info"}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDomainDraft(e.target.value)
              }
            />
          </div>
          <Button
            type="submit"
            label="Add domain"
            icon={Plus}
            disabled={
              normalizedDomainDraft.length === 0 || isDomainDraftDuplicate
            }
            className="mt-0 sm:mt-7"
          />
        </form>
        {allowedDomains.length === 0 && pendingDomainRequests.length === 0 ? (
          <ContentMessage variant="outline" size="lg">
            No Pod-specific domains are currently allowed.
          </ContentMessage>
        ) : (
          <div className="flex w-full flex-col divide-y divide-separator">
            {pendingDomainRequests.map((domain) => (
              <div key={domain} className="flex items-center gap-3 py-3">
                <div
                  title={domain}
                  className="flex min-w-0 grow items-center gap-2 overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2"
                >
                  <span className="font-mono text-sm text-foreground">
                    {domain}
                  </span>
                  <Chip
                    size="xs"
                    color="warning"
                    label="Waiting for approval"
                  />
                </div>
                <Button
                  variant="highlight"
                  size="sm"
                  label="Approve"
                  className="shrink-0"
                  onClick={() => {
                    onAllowedDomainsChange([...allowedDomains, domain]);
                    onRequestedDomainsChange(
                      requestedDomains.filter((item) => item !== domain)
                    );
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  label="Deny"
                  className="shrink-0"
                  onClick={() =>
                    onRequestedDomainsChange(
                      requestedDomains.filter((item) => item !== domain)
                    )
                  }
                />
              </div>
            ))}
            {allowedDomains.map((domain) => (
              <div key={domain} className="flex items-center gap-3 py-3">
                <div
                  title={domain}
                  className="flex min-w-0 grow items-center gap-2 overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2"
                >
                  <span className="font-mono text-sm text-foreground">
                    {domain}
                  </span>
                </div>
                <Button
                  variant="warning"
                  size="sm"
                  icon={Trash01}
                  tooltip="Remove domain"
                  className="shrink-0"
                  onClick={() =>
                    onAllowedDomainsChange(
                      allowedDomains.filter((item) => item !== domain)
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Environment variables */}
      <div className="flex w-full flex-col gap-4">
        <div className="heading-lg">Environment variables</div>
        <p className="text-sm text-muted-foreground">
          Values available to every Computer in this Pod. A Pod variable
          overrides a workspace variable with the same name. New Computers use
          the latest values; Computers already running keep theirs until they
          restart.
        </p>
        <ContentMessage
          variant="primary"
          icon={InfoCircle}
          size="lg"
          title="Two kinds of variables"
        >
          <div className="flex flex-col gap-2">
            <ul className="flex list-disc flex-col gap-2 pl-4">
              <li>
                <span className="font-mono">DSEC_</span> HTTPS secret: for
                credentials. Dust injects the real value into outbound HTTPS
                requests to the domains you allow. Code running in the Computer
                only ever sees a placeholder.
              </li>
              <li>
                <span className="font-mono">DUST_SANDBOX_</span> Config: for
                values that are not sensitive, such as feature flags,
                identifiers, public endpoints, or model names. Available in
                plain text on every new Computer.
              </li>
            </ul>
            <div>
              You cannot view a value after saving. You can replace it or delete
              it.
            </div>
          </div>
        </ContentMessage>
        <div className="flex justify-end">
          <Button
            label="Add variable"
            icon={Plus}
            onClick={() => setIsEnvVarDialogOpen(true)}
          />
        </div>
        {envVars.length === 0 ? (
          <ContentMessage variant="primary" size="lg">
            No environment variables yet.
          </ContentMessage>
        ) : (
          <ListGroup>
            {envVars.map((envVar) => (
              <ListItem key={envVar.name} itemsAlignment="center">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <pre
                    title={envVar.name}
                    className="min-w-0 self-start overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2 text-sm text-foreground"
                  >
                    {envVar.name}
                  </pre>
                  <div className="text-xs text-muted-foreground">
                    Updated {envVar.updatedAgo} ago by {envVar.updatedBy}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip
                      size="xs"
                      color={
                        envVar.kind === "https_secret" ? "warning" : "info"
                      }
                      label={envVarKindLabel(envVar.kind)}
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
                  <Button
                    variant="outline"
                    size="sm"
                    icon={envVar.kind === "config" ? Lock01 : Globe01}
                    tooltip={
                      envVar.kind === "config"
                        ? "Not sent to any domain"
                        : "Allowed domains"
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Edit04}
                    tooltip="Replace value"
                  />
                  <Button
                    variant="warning"
                    size="sm"
                    icon={Trash01}
                    tooltip="Delete variable"
                    onClick={() => setEnvVarToDelete(envVar)}
                  />
                </div>
              </ListItem>
            ))}
          </ListGroup>
        )}
      </div>

      {/* Add environment variable */}
      <Dialog
        open={isEnvVarDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open) {
            closeEnvVarDialog();
          }
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Add variable</DialogTitle>
          </DialogHeader>
          <DialogContainer className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="heading-sm text-foreground">HTTPS secret</span>
                <span className="text-xs text-muted-foreground">
                  Keep the value out of the Computer environment.
                </span>
              </div>
              <SliderToggle
                selected={envVarIsSecret}
                onClick={() => setEnvVarIsSecret((prev) => !prev)}
              />
            </div>
            <Input
              label="Name"
              name="env-var-name"
              placeholder="API_TOKEN"
              value={envVarNameDraft}
              message={`Saved as ${
                envVarIsSecret ? "DSEC_" : "DUST_SANDBOX_"
              }${envVarNameDraft.trim().toUpperCase()}`}
              messageStatus="info"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEnvVarNameDraft(e.target.value.toUpperCase())
              }
            />
            {envVarIsSecret && (
              <Input
                label="Allowed domains"
                name="env-var-domains"
                placeholder="e.g. api.openai.com, *.mistral.ai"
                value={envVarDomainsDraft}
                message="Comma-separated. HTTPS secrets require at least one domain."
                messageStatus="info"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEnvVarDomainsDraft(e.target.value)
                }
              />
            )}
            <TextArea
              value={envVarValueDraft}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setEnvVarValueDraft(e.target.value)
              }
              placeholder="Paste the secret value"
              minRows={8}
              resize="vertical"
            />
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: closeEnvVarDialog,
            }}
            rightButtonProps={{
              label: "Save",
              icon: Lock01,
              disabled: !canSaveEnvVar,
              onClick: handleSaveEnvVar,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete environment variable */}
      <Dialog
        open={envVarToDelete !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setEnvVarToDelete(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Delete {envVarToDelete?.name}</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            Are you sure you want to delete{" "}
            <strong>{envVarToDelete?.name}</strong>?
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
                if (envVarToDelete) {
                  onEnvVarsChange(
                    envVars.filter((item) => item.name !== envVarToDelete.name)
                  );
                }
                setEnvVarToDelete(null);
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
