/// <reference types="office-js" />

const DUST_KEY_PREFIX = "dust:";

/**
 * Returns `<partitionKey>:dust:` when `Office.context.partitionKey` is set (Office on the web), and
 * `dust:` otherwise (desktop).
 * See https://learn.microsoft.com/en-us/office/dev/add-ins/develop/persisting-add-in-state-and-settings#browser-storage
 */
export function getOfficeKeyPrefix(): string {
  const partitionKey = Office.context?.partitionKey;
  return partitionKey ? `${partitionKey}:${DUST_KEY_PREFIX}` : DUST_KEY_PREFIX;
}
