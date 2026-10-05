// The optional controls a composer can offer; consumers pass the subset they want shown.
export const INPUT_BAR_ACTIONS = [
  "capabilities",
  "attachment",
  "agents-list",
  "agents-list-with-actions",
  "model-picker",
  "turn-into-agent",
  "spaces",
  "voice",
  "fullscreen",
] as const;

export type InputBarAction = (typeof INPUT_BAR_ACTIONS)[number];
