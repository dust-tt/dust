export const RECORDING_TYPE_OPTIONS = [
  {
    value: "my_recordings",
    label: "My Recordings",
    description: "Recordings you created",
  },
  {
    value: "shared_external_recordings",
    label: "Shared External Recordings",
    description: "Recordings shared with you from outside your team",
  },
  // Disabled until we can improve the filter generation to generate more selective filters.
  // {
  //   value: "my_shared_with_team_recordings",
  //   label: "My Shared with Team Recordings",
  //   description: "Your recordings shared with your team",
  // },
  // {
  //   value: "shared_team_recordings",
  //   label: "Shared Team Recordings",
  //   description: "Recordings from your team members",
  // },
] as const;

export const RECORDING_TYPE_LABELS: Record<string, string> =
  RECORDING_TYPE_OPTIONS.reduce(
    (acc, option) => {
      acc[option.value] = option.label;
      return acc;
    },
    {} as Record<string, string>
  );
