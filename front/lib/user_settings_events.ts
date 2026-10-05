export const USER_SETTINGS_SECTIONS = [
  "personal",
  "customization",
  "notifications",
  "memory",
  "invitations",
] as const;

export type UserSettingsSection = (typeof USER_SETTINGS_SECTIONS)[number];

export const OPEN_USER_SETTINGS_EVENT = "open-user-settings";

// Opens the personal settings dialog (mounted in the user menu) from anywhere in the app, e.g. the
// "Edit" button of the user profile panel.
export class OpenUserSettingsEvent extends CustomEvent<{
  section: UserSettingsSection;
}> {
  constructor(section: UserSettingsSection = "personal") {
    super(OPEN_USER_SETTINGS_EVENT, { detail: { section } });
  }
}
