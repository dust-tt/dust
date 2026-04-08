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
      label: "Add knowledge",
      icon: BookOpenIcon,
      description:
        "Add files, links, or data sources relevant to this project.",
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
            description: "Invite people to this project as members or editors.",
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
        New Project? Let us help you setup.
      </h3>
      <CardGrid>
        {suggestions.map((suggestion) => (
          <Card
            key={suggestion.id}
            variant="primary"
            size="lg"
            onClick={suggestion.onClick}
            className="cursor-pointer"
          >
            <div className="flex w-full flex-col gap-2 text-sm">
              <div className="flex w-full items-center gap-2 font-semibold text-foreground dark:text-foreground-night">
                <Icon visual={suggestion.icon} size="sm" />
                <div className="w-full">{suggestion.label}</div>
              </div>
              {suggestion.description && (
                <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
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
