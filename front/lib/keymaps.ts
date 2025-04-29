const SUBMIT_MESSAGE_KEYS = ["enter", "cmd+enter"] as const;
export type SubmitMessageKey = (typeof SUBMIT_MESSAGE_KEYS)[number];

export const isSubmitMessageKey = (key: unknown): key is SubmitMessageKey => {
  if (typeof key !== "string") {
    return false;
  }
  return SUBMIT_MESSAGE_KEYS.includes(key as SubmitMessageKey);
};
