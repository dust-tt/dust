import { Button, ContentMessage, SliderToggle, XClose } from "@dust-tt/sparkle";

interface SuggestionPreviewHeaderProps {
  isApplied: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function SuggestionPreviewHeader({
  isApplied,
  onToggle,
  onClose,
}: SuggestionPreviewHeaderProps) {
  return (
    <div className="flex h-title shrink-0 items-center justify-between pr-4">
      <ContentMessage
        variant={isApplied ? "blue" : "primary"}
        className="h-full justify-center rounded-none rounded-br-xl py-0"
        action={<SliderToggle selected={isApplied} onClick={onToggle} />}
      >
        View edit suggestions
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
