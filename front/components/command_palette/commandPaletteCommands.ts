import { subNavigationAdmin } from "@app/components/navigation/config";
import type { SettingsSection } from "@app/components/UserSettingsPopover";
import type {
  ConcreteResourceType,
  GrantVerb,
} from "@app/types/group_permissions";
import type { SubscriptionType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";
import {
  Beaker02,
  Bell01,
  BookOpen01,
  Brain,
  File02,
  Globe01,
  IntersectDust,
  LogOut01,
  MagicWand02,
  Mail01,
  MessageCircle01,
  Moon01,
  Planet,
  Plus,
  PuzzlePiece01,
  Robot,
  Settings01,
  SlackLogo,
  Sun,
  User01,
  UserPlus01,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

export type CommandGroup =
  | "navigation"
  | "create"
  | "workspace"
  | "settings"
  | "appearance"
  | "account";

// Rendered in this order, so the groups people reach for most come first.
export const COMMAND_GROUP_ORDER: CommandGroup[] = [
  "create",
  "navigation",
  "settings",
  "appearance",
  "workspace",
  "account",
];

export const COMMAND_GROUP_LABELS: Record<CommandGroup, string> = {
  navigation: "Go to",
  create: "Create",
  workspace: "Workspace",
  settings: "Settings",
  appearance: "Appearance",
  account: "Account",
};

export interface CommandPaletteCommand {
  id: string;
  label: string;
  group: CommandGroup;
  icon: ComponentType<{ className?: string }>;
  // Extra search terms, so that sub-items of a settings section ("edit name",
  // "profile picture") find the section that hosts them.
  keywords: string[];
  run: () => void;
}

export interface BuildCommandsDeps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  featureFlags: WhitelistableFeature[];
  hasFeature: (flag: WhitelistableFeature) => boolean;
  hasPermission: (
    verb: GrantVerb,
    resourceType: ConcreteResourceType
  ) => boolean;
  hasPendingInvitations: boolean;
  currentRoute: string;
  navigate: (href: string) => void;
  openUserSettings: (section: SettingsSection) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  openCreatePod: () => void;
  openCreateSpace: () => void;
  signOut: () => void;
}

function buildNavigationCommands({
  owner,
  subscription,
  navigate,
}: BuildCommandsDeps): CommandPaletteCommand[] {
  const wId = owner.sId;
  const canUseProduct = subscription.plan.limits.canUseProduct;

  const commands: CommandPaletteCommand[] = [
    {
      id: "nav.conversations",
      label: "Go to Conversations",
      group: "navigation",
      icon: IntersectDust,
      keywords: ["chat", "work", "home", "conversation"],
      run: () => navigate(`/w/${wId}/conversation/new`),
    },
    {
      id: "nav.for-you",
      label: "Go to For you",
      group: "navigation",
      icon: Robot,
      keywords: ["home", "get started", "for you", "feed"],
      run: () => navigate(`/w/${wId}/for-you`),
    },
    {
      id: "nav.spaces",
      label: "Go to Spaces",
      group: "navigation",
      icon: Planet,
      keywords: ["space", "knowledge", "data sources", "vault"],
      run: () => navigate(`/w/${wId}/spaces`),
    },
    {
      id: "nav.agents",
      label: "Go to Agents",
      group: "navigation",
      icon: Robot,
      keywords: ["agent", "assistant", "manage agents", "builder"],
      run: () => navigate(`/w/${wId}/builder/agents`),
    },
    {
      id: "nav.skills",
      label: "Go to Skills",
      group: "navigation",
      icon: PuzzlePiece01,
      keywords: ["skill", "tools", "manage skills", "builder"],
      run: () => navigate(`/w/${wId}/builder/skills`),
    },
  ];

  if (canUseProduct) {
    commands.push({
      id: "nav.labs",
      label: "Go to Labs",
      group: "navigation",
      icon: Beaker02,
      keywords: ["labs", "exploratory", "experimental", "beta"],
      run: () => navigate(`/w/${wId}/labs`),
    });
  }

  commands.push(
    {
      id: "nav.docs",
      label: "Open Documentation",
      group: "navigation",
      icon: BookOpen01,
      keywords: ["help", "docs", "guides", "documentation", "support"],
      run: () => window.open("https://docs.dust.tt", "_blank"),
    },
    {
      id: "nav.academy",
      label: "Open Dust Academy",
      group: "navigation",
      icon: BookOpen01,
      keywords: ["help", "academy", "learn", "training", "course"],
      run: () => window.open("https://dust.tt/academy", "_blank"),
    },
    {
      id: "nav.community",
      label: "Join the Slack Community",
      group: "navigation",
      icon: SlackLogo,
      keywords: ["help", "slack", "community", "support"],
      run: () =>
        window.open(
          "https://dust-community.tightknit.community/join",
          "_blank"
        ),
    }
  );

  return commands;
}

function buildCreateCommands({
  owner,
  hasPermission,
  navigate,
  openCreatePod,
  openCreateSpace,
}: BuildCommandsDeps): CommandPaletteCommand[] {
  const wId = owner.sId;
  const commands: CommandPaletteCommand[] = [
    {
      id: "create.conversation",
      label: "New conversation",
      group: "create",
      icon: MessageCircle01,
      keywords: ["new", "chat", "conversation", "ask"],
      run: () => navigate(`/w/${wId}/conversation/new`),
    },
    {
      id: "create.pod",
      label: "New pod",
      group: "create",
      icon: Plus,
      keywords: ["new", "pod", "project", "team"],
      run: openCreatePod,
    },
  ];

  if (hasPermission("create", "agent")) {
    commands.push(
      {
        id: "create.agent",
        label: "New agent",
        group: "create",
        icon: File02,
        keywords: ["new", "agent", "assistant", "scratch", "build"],
        run: () => navigate(`/w/${wId}/builder/agents/new`),
      },
      {
        id: "create.agent-from-template",
        label: "New agent from template",
        group: "create",
        icon: MagicWand02,
        keywords: ["new", "agent", "template", "gallery"],
        run: () => navigate(`/w/${wId}/builder/agents/create`),
      }
    );
  }

  if (hasPermission("create", "skill")) {
    commands.push({
      id: "create.skill",
      label: "New skill",
      group: "create",
      icon: PuzzlePiece01,
      keywords: ["new", "skill", "tool", "build"],
      run: () => navigate(`/w/${wId}/builder/skills/new`),
    });
  }

  if (hasPermission("create", "space")) {
    commands.push({
      id: "create.space",
      label: "New space",
      group: "create",
      icon: Planet,
      keywords: ["new", "space", "vault", "knowledge"],
      run: openCreateSpace,
    });
  }

  return commands;
}

// The admin sidebar already encodes role, plan and feature-flag gating for every
// workspace destination, so the palette derives its Workspace group from it
// instead of duplicating those rules.
function buildWorkspaceCommands(
  deps: BuildCommandsDeps
): CommandPaletteCommand[] {
  const {
    owner,
    subscription,
    featureFlags,
    hasPermission,
    currentRoute,
    navigate,
  } = deps;

  const sections = subNavigationAdmin({
    owner,
    currentRoute,
    featureFlags,
    subscription,
    hasPermission,
  });

  const commands: CommandPaletteCommand[] = [];
  for (const section of sections) {
    for (const menu of section.menus) {
      if (menu.disabled || !menu.href) {
        continue;
      }
      if (menu.featureFlag && !featureFlags.includes(menu.featureFlag)) {
        continue;
      }
      const href = menu.href;
      commands.push({
        id: `workspace.${menu.id}`,
        label: menu.label,
        group: "workspace",
        icon: menu.icon,
        keywords: ["admin", "workspace", "settings", menu.label.toLowerCase()],
        run: () => navigate(href),
      });
    }
  }

  // "Invite a member" is the reason most people open the members page.
  if (commands.some((c) => c.id === "workspace.members")) {
    commands.push({
      id: "workspace.invite-member",
      label: "Invite a member",
      group: "workspace",
      icon: UserPlus01,
      keywords: ["invite", "member", "people", "add user", "teammate"],
      run: () => navigate(`/w/${owner.sId}/members`),
    });
  }

  return commands;
}

function buildSettingsCommands({
  subscription,
  hasFeature,
  hasPendingInvitations,
  openUserSettings,
}: BuildCommandsDeps): CommandPaletteCommand[] {
  if (!subscription.plan.limits.canUseProduct) {
    return [];
  }

  const commands: CommandPaletteCommand[] = [
    {
      id: "settings.personal",
      label: "Personal Information",
      group: "settings",
      icon: User01,
      keywords: [
        "personal settings",
        "profile",
        "edit name",
        "first name",
        "last name",
        "profile picture",
        "avatar",
        "email",
      ],
      run: () => openUserSettings("personal"),
    },
    {
      id: "settings.customization",
      label: "Customization",
      group: "settings",
      icon: Settings01,
      keywords: [
        "personal settings",
        "customization",
        "theme",
        "appearance",
        "send message shortcut",
        "keyboard shortcut",
        "agents on home page",
      ],
      run: () => openUserSettings("customization"),
    },
    {
      id: "settings.notifications",
      label: "Notifications",
      group: "settings",
      icon: Bell01,
      keywords: [
        "personal settings",
        "notifications",
        "sound",
        "inbox",
        "slack",
        "for you",
        "email",
      ],
      run: () => openUserSettings("notifications"),
    },
  ];

  if (hasFeature("user_memory")) {
    commands.push({
      id: "settings.memory",
      label: "Memory",
      group: "settings",
      icon: Brain,
      keywords: [
        "personal settings",
        "memory",
        "about you",
        "enable memory",
        "disable memory",
      ],
      run: () => openUserSettings("memory"),
    });
  }

  if (hasPendingInvitations) {
    commands.push({
      id: "settings.invitations",
      label: "Invitations",
      group: "settings",
      icon: Mail01,
      keywords: [
        "personal settings",
        "invitations",
        "pending",
        "accept",
        "reject",
        "join workspace",
      ],
      run: () => openUserSettings("invitations"),
    });
  }

  return commands;
}

function buildAppearanceCommands({
  setTheme,
}: BuildCommandsDeps): CommandPaletteCommand[] {
  return [
    {
      id: "appearance.theme-light",
      label: "Set theme: Light",
      group: "appearance",
      icon: Sun,
      keywords: ["theme", "light", "appearance", "mode"],
      run: () => setTheme("light"),
    },
    {
      id: "appearance.theme-dark",
      label: "Set theme: Dark",
      group: "appearance",
      icon: Moon01,
      keywords: ["theme", "dark", "appearance", "mode", "night"],
      run: () => setTheme("dark"),
    },
    {
      id: "appearance.theme-system",
      label: "Set theme: System",
      group: "appearance",
      icon: Globe01,
      keywords: ["theme", "system", "appearance", "mode", "auto"],
      run: () => setTheme("system"),
    },
  ];
}

function buildAccountCommands({
  signOut,
}: BuildCommandsDeps): CommandPaletteCommand[] {
  return [
    {
      id: "account.sign-out",
      label: "Sign out",
      group: "account",
      icon: LogOut01,
      keywords: ["sign out", "log out", "logout", "leave"],
      run: signOut,
    },
  ];
}

export function buildCommandPaletteCommands(
  deps: BuildCommandsDeps
): CommandPaletteCommand[] {
  return [
    ...buildCreateCommands(deps),
    ...buildNavigationCommands(deps),
    ...buildSettingsCommands(deps),
    ...buildAppearanceCommands(deps),
    ...buildWorkspaceCommands(deps),
    ...buildAccountCommands(deps),
  ];
}

export function filterCommands(
  commands: CommandPaletteCommand[],
  query: string
): CommandPaletteCommand[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return commands;
  }

  return commands.filter((command) => {
    if (command.label.toLowerCase().includes(trimmed)) {
      return true;
    }
    return command.keywords.some((keyword) => keyword.includes(trimmed));
  });
}
