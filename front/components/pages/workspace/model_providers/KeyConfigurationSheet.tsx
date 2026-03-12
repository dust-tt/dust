import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import { PRETTIFIED_PROVIDER_NAMES } from "@app/types/provider_selection";
import {
  ContextItem,
  Hoverable,
  Icon,
  Input,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
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
  providerId: ByokModelProviderIdType;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  logo: ComponentType;
}

export function KeyConfigurationSheet({
  providerId,
  isOpen,
  onOpenChange,
  logo,
}: KeyConfigurationSheetProps) {
  const [apiKey, setApiKey] = useState("");

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
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
            />
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => onOpenChange(false),
          }}
          rightButtonProps={{
            label: "Save",
            onClick: () => {},
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
