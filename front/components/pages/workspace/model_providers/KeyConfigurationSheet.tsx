import { useSaveProviderCredential } from "@app/lib/swr/provider_credentials";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import { PRETTIFIED_PROVIDER_NAMES } from "@app/types/provider_selection";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ContextItem,
  Hoverable,
  Icon,
  Input,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ComponentType } from "react";
import { useState } from "react";

const PROVIDER_ID_TO_DOCS_LINK: Record<ByokModelProviderIdType, string> = {
  openai: "https://developers.openai.com/api/docs/quickstart",
  anthropic: "https://platform.claude.com/docs/en/api/overview",
  google_ai_studio: "https://ai.google.dev/gemini-api/docs/api-key",
};

interface ProviderInfoProps {
  providerId: ByokModelProviderIdType;
  logo: ComponentType;
}

function ProviderInfo({ providerId, logo }: ProviderInfoProps) {
  return (
    <div className="flex flex-col gap-2">
      <Page.H variant="h6">
        <Trans>Provider</Trans>
      </Page.H>
      <ContextItem
        title={PRETTIFIED_PROVIDER_NAMES[providerId]}
        visual={<Icon visual={logo} size="md" />}
        className="p-0"
      >
        <ContextItem.Description>
          <Hoverable
            href={PROVIDER_ID_TO_DOCS_LINK[providerId]}
            target="_blank"
            variant="highlight"
            className="font-normal text-sm"
          >
            <Trans>Documentation</Trans>
          </Hoverable>
        </ContextItem.Description>
      </ContextItem>
    </div>
  );
}

interface KeyConfigurationSheetProps {
  owner: LightWorkspaceType;
  providerId: ByokModelProviderIdType;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  logo: ComponentType;
  apiKey: string | undefined;
}

export function KeyConfigurationSheet({
  owner,
  providerId,
  isOpen,
  onOpenChange,
  logo,
  apiKey: initialApiKey,
}: KeyConfigurationSheetProps) {
  const { t } = useLingui();
  const [apiKey, setApiKey] = useState("");

  const { saveProviderCredential, isSaving } = useSaveProviderCredential({
    owner,
  });

  const handleSave = async () => {
    const result = await saveProviderCredential({
      providerId,
      apiKey,
      isNew: initialApiKey === undefined,
    });

    if (result) {
      setApiKey("");
      onOpenChange(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (isSaving) {
      return;
    }
    if (!open) {
      setApiKey("");
    }
    onOpenChange(open);
  };

  const providerName = PRETTIFIED_PROVIDER_NAMES[providerId];

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            <Trans>Configure {providerName} API key</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <ProviderInfo providerId={providerId} logo={logo} />
          <div className="flex flex-col gap-2">
            <Page.H variant="h6">
              <Trans>API key</Trans>
            </Page.H>
            <Input
              placeholder={t`Type an API key`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isSaving}
            />
          </div>
        </SheetContainer>
        <div className="flex flex-none flex-col gap-2">
          <div className="flex items-center justify-between border-t border-border p-3">
            <Button
              label={t`Cancel`}
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSaving}
            />
            <Button
              label={t`Save`}
              onClick={handleSave}
              disabled={!apiKey.trim() || isSaving}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
