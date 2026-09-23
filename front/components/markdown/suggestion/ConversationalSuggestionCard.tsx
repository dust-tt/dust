import {
  Avatar,
  Button,
  Card,
  ChevronDown,
  ChevronUp,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  PuzzlePiece01,
} from "@dust-tt/sparkle";
import type { ComponentProps, ReactNode } from "react";

const DEFAULT_VISUAL = (
  <Avatar
    icon={PuzzlePiece01}
    size="sm"
    backgroundColor="bg-highlight-50"
    iconColor="text-highlight-500"
  />
);

interface ConversationalSuggestionCardProps {
  title: string;
  analysis?: string | null;
  /** Overrides the default icon chip, e.g. to show the agent's picture. */
  visual?: React.ReactElement<ComponentProps<typeof Avatar>>;
  /** Extra detail revealed behind the chevron toggle at the bottom of the card. */
  collapsibleContent?: ReactNode;
  onAccept?: () => void;
  onReject?: () => void;
  onPreview?: () => void;
  acceptLabel?: string;
  rejectLabel?: string;
  disabled?: boolean;
  isAccepting?: boolean;
  isDeclining?: boolean;
}

export function ConversationalSuggestionCard({
  title,
  analysis,
  visual = DEFAULT_VISUAL,
  collapsibleContent,
  onAccept,
  onReject,
  onPreview,
  acceptLabel = "Accept",
  rejectLabel = "Decline",
  disabled = false,
  isAccepting = false,
  isDeclining = false,
}: ConversationalSuggestionCardProps) {
  const hasActions = !!onAccept && !!onReject;

  return (
    <Card
      variant="secondary"
      size="md"
      containerClassName="w-full max-w-lg"
      className="flex-col p-0"
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          {visual}
          <span className="heading-base text-foreground">{title}</span>
        </div>

        {analysis && (
          <p className="text-sm text-muted-foreground">{analysis}</p>
        )}

        {(hasActions || onPreview) && (
          <div className="flex justify-end gap-2">
            {onPreview && (
              <Button
                variant="ghost"
                size="sm"
                label="View in builder"
                onClick={onPreview}
              />
            )}
            {hasActions && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  label={rejectLabel}
                  onClick={onReject}
                  disabled={disabled}
                  isLoading={isDeclining}
                />
                <Button
                  variant="highlight"
                  size="sm"
                  label={acceptLabel}
                  onClick={onAccept}
                  disabled={disabled}
                  isLoading={isAccepting}
                />
              </>
            )}
          </div>
        )}
      </div>

      {collapsibleContent && (
        <Collapsible>
          {/* Padding lives on an inner element: padding on the animated one
              can't shrink with its height, which makes the toggle jump. */}
          <CollapsibleContent className="bg-muted-background">
            <div className="p-3">{collapsibleContent}</div>
          </CollapsibleContent>
          <CollapsibleTrigger
            variant="secondary"
            hideChevron
            className="h-5 w-full justify-center bg-muted-background"
          >
            <Icon
              visual={ChevronDown}
              size="sm"
              className="block group-data-[state=open]/col:hidden"
            />
            <Icon
              visual={ChevronUp}
              size="sm"
              className="hidden group-data-[state=open]/col:block"
            />
          </CollapsibleTrigger>
        </Collapsible>
      )}
    </Card>
  );
}
