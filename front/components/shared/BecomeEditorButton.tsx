import { Button, UsersPlus } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface BecomeEditorButtonProps {
  isLoading: boolean;
  onClick: () => void;
}

export function BecomeEditorButton({
  isLoading,
  onClick,
}: BecomeEditorButtonProps) {
  const { t } = useLingui();

  return (
    <Button
      variant="outline"
      size="sm"
      icon={UsersPlus}
      label={isLoading ? t`Becoming an editor...` : t`Become an editor`}
      isLoading={isLoading}
      disabled={isLoading}
      onClick={onClick}
      type="button"
    />
  );
}
