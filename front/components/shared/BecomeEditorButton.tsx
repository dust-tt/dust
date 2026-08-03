import { Button, UsersPlus } from "@dust-tt/sparkle";

interface BecomeEditorButtonProps {
  isLoading: boolean;
  onClick: () => void;
}

export function BecomeEditorButton({
  isLoading,
  onClick,
}: BecomeEditorButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      icon={UsersPlus}
      label={isLoading ? "Becoming an editor..." : "Become an editor"}
      isLoading={isLoading}
      disabled={isLoading}
      onClick={onClick}
      type="button"
    />
  );
}
