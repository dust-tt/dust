import { getIcon } from "@app/components/resources/resources_icons";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { WEBHOOK_PROVIDERS } from "@app/lib/triggers/webhooks";
import { CLIENT_SIDE_WEBHOOK_PRESETS } from "@app/lib/triggers/webhooks_client_side";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import {
  ActionCard,
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Plus,
  SearchInput,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useRef, useState } from "react";

type TriggerOption = {
  provider: WebhookProvider | null;
  name: string;
  description: string;
  icon: ReturnType<typeof getIcon>;
};

type AddTriggerButtonProps = {
  onClick: () => void;
  variant?: "primary" | "outline";
};

export function AddTriggerButton({
  onClick,
  variant = "primary",
}: AddTriggerButtonProps) {
  const { t } = useLingui();

  return (
    <Button
      label={t`Add source`}
      variant={variant}
      icon={Plus}
      size="sm"
      onClick={withTracking(
        TRACKING_AREAS.TRIGGERS,
        "add_trigger_menu",
        onClick
      )}
    />
  );
}

type AddTriggerDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  createWebhook: (provider: WebhookProvider | null) => void;
};

export function AddTriggerDialog({
  isOpen,
  setIsOpen,
  createWebhook,
}: AddTriggerDialogProps) {
  const { t } = useLingui();
  const { hasFeature } = useFeatureFlags();
  const [searchText, setSearchText] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const triggerOptions = useMemo<TriggerOption[]>(
    () => [
      ...WEBHOOK_PROVIDERS.filter((provider) => {
        const preset = CLIENT_SIDE_WEBHOOK_PRESETS[provider];
        return (
          preset.featureFlag === undefined || hasFeature(preset.featureFlag)
        );
      }).map((provider) => {
        const preset = CLIENT_SIDE_WEBHOOK_PRESETS[provider];
        const presetName = preset.name;
        return {
          provider,
          name: preset.featureFlag ? t`${presetName} (Preview)` : presetName,
          description: t(preset.description),
          icon: getIcon(preset.icon),
        };
      }),
    ],
    [hasFeature, t]
  );

  const filteredTriggerOptions = useMemo(() => {
    const normalizedSearchText = searchText.toLocaleLowerCase();
    return triggerOptions.filter(
      ({ name, description }) =>
        name.toLocaleLowerCase().includes(normalizedSearchText) ||
        description.toLocaleLowerCase().includes(normalizedSearchText)
    );
  }, [searchText, triggerOptions]);

  const onOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSearchText("");
    }
  };

  const onSelectTrigger = (provider: WebhookProvider | null) => {
    createWebhook(provider);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        height="xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            <Trans>Add a trigger</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer
          fixedContent={
            <div className="flex flex-row items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                name="search"
                placeholder={t`Search trigger sources...`}
                value={searchText}
                onChange={setSearchText}
                className="flex-grow"
              />
              <Button
                icon={Plus}
                label={t`Custom webhook`}
                variant="outline"
                onClick={() => onSelectTrigger(null)}
              />
            </div>
          }
        >
          {filteredTriggerOptions.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-8">
              <div className="px-4 text-center">
                <div className="mb-2 text-lg font-medium text-foreground">
                  <Trans>No trigger source matches your search</Trans>
                </div>
                <div className="max-w-sm text-muted-foreground">
                  <Trans>Try a different search term.</Trans>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {filteredTriggerOptions.map((triggerOption) => (
                <ActionCard
                  key={triggerOption.provider ?? "custom"}
                  icon={triggerOption.icon}
                  label={triggerOption.name}
                  description={triggerOption.description}
                  canAdd={false}
                  onClick={() => onSelectTrigger(triggerOption.provider)}
                  cardContainerClassName="h-28"
                  descriptionLineClamp={3}
                />
              ))}
            </div>
          )}
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
