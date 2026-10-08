import type {
  DustMcpServerRedirectUriErrorCode,
  DustMcpServerSettings,
} from "@app/lib/api/mcp_server/dust_mcp_server_settings";
import {
  normalizeDustMcpServerRedirectUri,
  validateDustMcpServerRedirectUri,
} from "@app/lib/api/mcp_server/dust_mcp_server_settings";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  Button,
  ContentMessage,
  Input,
  Page,
  Plus,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Trash01,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useState } from "react";

const REDIRECT_URI_ERROR_MESSAGES: Record<
  DustMcpServerRedirectUriErrorCode,
  MessageDescriptor
> = {
  empty_redirect_uri: msg`Redirect URI cannot be empty.`,
  missing_scheme: msg`Redirect URI must include a scheme (for example http://, https://, or cursor://).`,
};

interface DustMcpServerSettingsSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  settings: DustMcpServerSettings;
  isSaving: boolean;
  onSave: (settings: DustMcpServerSettings) => Promise<boolean>;
}

export function DustMcpServerSettingsSheet({
  isOpen,
  onOpenChange,
  settings,
  isSaving,
  onSave,
}: DustMcpServerSettingsSheetProps) {
  const { t } = useLingui();
  const { isAdmin } = useAuth();
  const [draftSettings, setDraftSettings] = useState(settings);
  const [redirectUriInput, setRedirectUriInput] = useState("");
  const [wasOpen, setWasOpen] = useState(isOpen);

  useEffect(() => {
    if (isOpen && !wasOpen) {
      setDraftSettings(settings);
      setRedirectUriInput("");
    }
    setWasOpen(isOpen);
  }, [isOpen, wasOpen, settings]);

  const redirectUriValidation = useMemo(() => {
    if (!redirectUriInput.trim()) {
      return null;
    }
    return validateDustMcpServerRedirectUri(redirectUriInput);
  }, [redirectUriInput]);

  const normalizedRedirectUri =
    redirectUriValidation?.isOk() === true ? redirectUriValidation.value : null;
  const isDuplicateRedirectUri =
    normalizedRedirectUri !== null &&
    draftSettings.allowedRedirectUris.includes(normalizedRedirectUri);
  const redirectUriInputMessage =
    redirectUriValidation?.isErr() === true
      ? t(REDIRECT_URI_ERROR_MESSAGES[redirectUriValidation.error.code])
      : isDuplicateRedirectUri
        ? t`This redirect URI is already in the list.`
        : normalizedRedirectUri
          ? t`Will be saved as ${normalizedRedirectUri}.`
          : t`Use a full redirect URI such as https://example.com/oauth/callback.`;
  const isRedirectUriInputInvalid =
    redirectUriValidation?.isErr() === true || isDuplicateRedirectUri;
  const canAddRedirectUri =
    normalizedRedirectUri !== null &&
    !isDuplicateRedirectUri &&
    !isSaving &&
    isAdmin;

  const isDirty =
    draftSettings.acceptAllRedirectUris !== settings.acceptAllRedirectUris ||
    draftSettings.allowedRedirectUris.join("\n") !==
      settings.allowedRedirectUris.join("\n");

  const handleAddRedirectUri = () => {
    if (!canAddRedirectUri || normalizedRedirectUri === null) {
      return;
    }

    setDraftSettings((current) => ({
      ...current,
      allowedRedirectUris: [
        ...current.allowedRedirectUris,
        normalizedRedirectUri,
      ],
    }));
    setRedirectUriInput("");
  };

  const handleRemoveRedirectUri = (uri: string) => {
    setDraftSettings((current) => ({
      ...current,
      allowedRedirectUris: current.allowedRedirectUris.filter(
        (existingUri) => existingUri !== uri
      ),
    }));
  };

  const handleSave = async () => {
    if (!isAdmin) {
      return;
    }

    if (
      !draftSettings.acceptAllRedirectUris &&
      draftSettings.allowedRedirectUris.length === 0
    ) {
      return;
    }

    const success = await onSave({
      ...settings,
      acceptAllRedirectUris: draftSettings.acceptAllRedirectUris,
      allowedRedirectUris: draftSettings.allowedRedirectUris,
    });
    if (success) {
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    if (isSaving) {
      return;
    }
    onOpenChange(false);
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            <Trans>Redirect URIs</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <Page.Vertical align="stretch" gap="lg">
            {!isAdmin && (
              <ContentMessage variant="info" size="lg">
                <Trans>
                  Only workspace admins can manage MCP server settings.
                </Trans>
              </ContentMessage>
            )}

            <RadioGroup
              value={draftSettings.acceptAllRedirectUris ? "all" : "allowlist"}
              onValueChange={(value) => {
                setDraftSettings((current) => ({
                  ...current,
                  acceptAllRedirectUris: value === "all",
                }));
              }}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <RadioGroupItem
                  value="all"
                  id="dust-mcp-redirect-uri-policy-all"
                  label={t`Accept all redirect URIs`}
                  disabled={!isAdmin || isSaving}
                />
                <Page.P variant="secondary">
                  <Trans>
                    Any redirect URI requested during OAuth will be allowed.
                  </Trans>
                </Page.P>
              </div>
              <div className="flex flex-col gap-1">
                <RadioGroupItem
                  value="allowlist"
                  id="dust-mcp-redirect-uri-policy-allowlist"
                  label={t`Allowlisted redirect URIs only`}
                  disabled={!isAdmin || isSaving}
                />
                <Page.P variant="secondary">
                  <Trans>
                    Only the redirect URIs listed below will be accepted.
                  </Trans>
                </Page.P>
              </div>
            </RadioGroup>

            {!draftSettings.acceptAllRedirectUris && (
              <Page.Vertical align="stretch" gap="md">
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-start"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleAddRedirectUri();
                  }}
                >
                  <div className="grow">
                    <Input
                      label={t`Redirect URI`}
                      name="redirectUri"
                      placeholder="https://example.com/oauth/callback"
                      value={redirectUriInput}
                      message={redirectUriInputMessage}
                      messageStatus={
                        isRedirectUriInputInvalid ? "error" : "info"
                      }
                      onChange={(event) =>
                        setRedirectUriInput(
                          normalizeDustMcpServerRedirectUri(event.target.value)
                        )
                      }
                      disabled={!isAdmin || isSaving}
                    />
                  </div>
                  <Button
                    type="submit"
                    label={t`Add URI`}
                    icon={Plus}
                    disabled={!canAddRedirectUri}
                    isLoading={isSaving}
                    className="mt-0 sm:mt-7"
                  />
                </form>

                {draftSettings.allowedRedirectUris.length === 0 ? (
                  <ContentMessage variant="outline" size="lg">
                    <Trans>Add at least one redirect URI before saving.</Trans>
                  </ContentMessage>
                ) : (
                  <div className="flex w-full flex-col divide-y divide-separator">
                    {draftSettings.allowedRedirectUris.map((uri) => (
                      <div key={uri} className="flex items-center gap-3 py-3">
                        <pre
                          title={uri}
                          className="min-w-0 grow overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2 text-sm text-foreground"
                        >
                          {uri}
                        </pre>
                        <Button
                          variant="warning"
                          size="mini"
                          icon={Trash01}
                          tooltip={t`Remove ${uri}`}
                          disabled={!isAdmin || isSaving}
                          onClick={() => handleRemoveRedirectUri(uri)}
                          className="shrink-0"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </Page.Vertical>
            )}
          </Page.Vertical>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
            onClick: handleClose,
            disabled: isSaving,
          }}
          rightButtonProps={{
            label: isSaving ? t`Saving...` : t`Save`,
            onClick: () => {
              void handleSave();
            },
            disabled:
              !isAdmin ||
              isSaving ||
              !isDirty ||
              (!draftSettings.acceptAllRedirectUris &&
                draftSettings.allowedRedirectUris.length === 0),
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
