import { Card, CardGrid, Icon, type IconComponent } from "@dust-tt/sparkle";

export interface Suggestion {
  id: string;
  label: string;
  icon: IconComponent;
  description: string;
  onClick: () => void;
}

interface ConversationSuggestionProps {
  suggestions: Suggestion[];
}

export function ConversationSuggestion({
  suggestions,
}: ConversationSuggestionProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="s-flex s-flex-col s-gap-3">
      <h3 className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
        New room? Let us help you setup.
      </h3>
      <CardGrid>
        {suggestions.map((suggestion) => (
          <Card
            key={suggestion.id}
            variant="secondary"
            size="md"
            onClick={suggestion.onClick}
            className="s-cursor-pointer"
          >
            <div className="s-flex s-w-full s-flex-col s-gap-2 s-text-sm">
              <div className="s-flex s-w-full s-items-center s-gap-2 s-font-semibold s-text-foreground">
                <Icon visual={suggestion.icon} size="sm" />
                <div className="s-w-full">{suggestion.label}</div>
              </div>
              {suggestion.description && (
                <div className="s-text-sm s-text-muted-foreground">
                  {suggestion.description}
                </div>
              )}
            </div>
          </Card>
        ))}
      </CardGrid>
    </div>
  );
}
