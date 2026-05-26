import isNumber from "lodash/isNumber";

export const CONVERSATIONS_RETENTION_MIN_DAYS = 1;

export const isValidConversationsRetentionDays = (
  retentionDays: string | number | boolean | object | undefined
): retentionDays is number => {
  return (
    isNumber(retentionDays) && retentionDays >= CONVERSATIONS_RETENTION_MIN_DAYS
  );
};
