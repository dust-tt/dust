import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export function getVisualizationRetryMessage(
  t: (descriptor: MessageDescriptor) => string,
  errorMessage: string
): string {
  return `${t(msg`The visualization code failed with this error:`)}\n\`\`\`\n${errorMessage}\n\`\`\`\n${t(msg`Please fix the code.`)}`;
}
