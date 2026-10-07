import { Button, ContentMessage, SliderToggle, XClose } from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";

interface SuggestionPreviewHeaderProps {
  isApplied: boolean;
  hasCreation: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function SuggestionPreviewHeader({
  isApplied,
  hasCreation,
  onToggle,
  onClose,
}: SuggestionPreviewHeaderProps) {
  return (
    <div className="flex h-title shrink-0 items-center justify-between pr-4">
      <ContentMessage
        variant={isApplied ? "blue" : "primary"}
        className="h-full justify-center rounded-none rounded-br-xl py-0"
        action={
          !hasCreation && (
            <SliderToggle selected={isApplied} onClick={onToggle} />
          )
        }
      >
        <Trans>Suggestion preview</Trans>
      </ContentMessage>
      <Button
        variant="ghost"
        onClick={onClose}
        icon={XClose}
        className="text-element-600 hover:text-element-900"
      />
    </div>
  );
}
