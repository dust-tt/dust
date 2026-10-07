import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// All recording types, including legacy ones. Used for labels and validation
// to support existing webhooks.
const RECORDING_TYPE_OPTIONS = [
  {
    value: "my_recordings",
    label: msg`My recordings`,
    description: msg`Recordings you created`,
  },
  {
    value: "shared_external_recordings",
    label: msg`Shared external recordings`,
    description: msg`Recordings shared with you from outside your team`,
  },
  {
    value: "my_shared_with_team_recordings",
    label: msg`My shared with team recordings`,
    description: msg`Your recordings shared with your team`,
  },
  {
    value: "shared_team_recordings",
    label: msg`Shared team recordings`,
    description: msg`Recordings from your team members`,
  },
] as const;

// Recording types available for new webhook creation.
export const CREATABLE_RECORDING_TYPE_OPTIONS = RECORDING_TYPE_OPTIONS.filter(
  (option) =>
    option.value !== "my_recordings" &&
    option.value !== "my_shared_with_team_recordings"
);

export const RECORDING_TYPE_LABELS: Record<string, MessageDescriptor> =
  RECORDING_TYPE_OPTIONS.reduce(
    (acc, option) => {
      acc[option.value] = option.label;
      return acc;
    },
    {} as Record<string, MessageDescriptor>
  );
