import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  BookOpenIcon,
  Card,
  CardGrid,
  ContactsUserIcon,
  Icon,
  ListCheckIcon,
} from "@dust-tt/sparkle";

interface SpaceConversationsActionsProps {
  isEditor: boolean;
  onOpenMembersPanel: () => void;
}

export function SpaceConversationsActions({
  isEditor,
  onOpenMembersPanel,
}: SpaceConversationsActionsProps) {
  const { hasFeature } = useFeatureFlags();
  const canShowTodosTab = hasFeature("project_todo");

  const suggestions = canShowTodosTab
    ? [
        {
          id: "onboarding-todos",
          label: "Get your project off the ground",
          icon: ListCheckIcon,
          description:
            "Add context, connect your knowledge, and bring the right people in. Flying solo? It still keeps everything in one place.",
          variant: "highlight" as const,
          isPulsing: true,
          onClick: () => {
            window.location.hash = "todos";
          },
        },
      ]
    : [
        {
          id: "add-context",
          label: "Add knowledge",
          icon: BookOpenIcon,
          description:
            "Add files, links, or data sources relevant to this project.",
          variant: "primary" as const,
          isPulsing: false,
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
                description:
                  "Invite people to this project as members or editors.",
                variant: "primary" as const,
                isPulsing: false,
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
            variant={suggestion.variant}
            size="lg"
            isPulsing={suggestion.isPulsing}
            onClick={suggestion.onClick}
            className="cursor-pointer"
          >
            <div className="flex w-full flex-col gap-2 text-sm">
              <div className="flex w-full items-center gap-2 font-semibold text-foreground dark:text-foreground-night">
                <Icon visual={suggestion.icon} size="sm" />
                <div className="w-full">{suggestion.label}</div>
              </div>
              <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                {suggestion.description}
              </div>
            </div>
          </Card>
        ))}
      </CardGrid>
    </div>
  );
}
