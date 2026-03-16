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
import type { ComponentType } from "react";
import { useState } from "react";

const PROVIDER_ID_TO_DOCS_LINK: Record<ByokModelProviderIdType, string> = {
  openai: "https://developers.openai.com/api/docs/quickstart",
  anthropic: "https://platform.claude.com/docs/en/api/overview",
};

interface ProviderInfoProps {
  providerId: ByokModelProviderIdType;
  logo: ComponentType;
}

function ProviderInfo({ providerId, logo }: ProviderInfoProps) {
  return (
    <div className="flex flex-col gap-2">
      <Page.H variant="h6">Provider</Page.H>
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
            Documentation
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
  const [apiKey, setApiKey] = useState(initialApiKey ?? "");

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

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            Configure {PRETTIFIED_PROVIDER_NAMES[providerId]} API key
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <ProviderInfo providerId={providerId} logo={logo} />
          <div className="flex flex-col gap-2">
            <Page.H variant="h6">Api key</Page.H>
            <Input
              placeholder="Type an API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isSaving}
            />
          </div>
        </SheetContainer>
        <div className="flex flex-none flex-col gap-2">
          <div className="flex items-center justify-between border-t border-border p-3 dark:border-border-night">
            <Button
              label="Cancel"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSaving}
            />
            <Button
              label="Save"
              onClick={handleSave}
              disabled={!apiKey.trim() || isSaving}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
