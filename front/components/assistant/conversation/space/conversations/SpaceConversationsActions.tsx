import {
  BookOpenIcon,
  Card,
  CardGrid,
  ContactsUserIcon,
  Icon,
} from "@dust-tt/sparkle";

interface SpaceConversationsActionsProps {
  isEditor: boolean;
  onOpenMembersPanel: () => void;
}

export function SpaceConversationsActions({
  isEditor,
  onOpenMembersPanel,
}: SpaceConversationsActionsProps) {
  const suggestions = [
    {
      id: "add-context",
      label: "Add context",
      icon: BookOpenIcon,
      onClick: () => {
        window.location.hash = "context";
      },
    },
    ...(isEditor
      ? [
          {
            id: "manage-members",
            label: "Manage members",
            icon: ContactsUserIcon,
            onClick: () => {
              onOpenMembersPanel();
            },
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <h3 className="heading-lg text-foreground dark:text-foreground-night">
        Suggested actions
      </h3>
      <CardGrid>
        {suggestions.map((suggestion) => (
          <Card
            key={suggestion.id}
            variant="primary"
            size="md"
            onClick={suggestion.onClick}
            className="cursor-pointer"
          >
            <div className="flex w-full flex-col gap-2 text-sm">
              <div className="flex w-full items-center gap-2 font-semibold text-foreground dark:text-foreground-night">
                <Icon visual={suggestion.icon} size="sm" />
                <div className="w-full">{suggestion.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </CardGrid>
    </div>
  );
}
