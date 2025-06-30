import { DocumentIcon } from "@dust-tt/sparkle";

import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { isConnectorProvider } from "@app/types";

// TODO: Move to another place.
export function getDocumentIcon(provider: string | null | undefined) {
  if (provider && isConnectorProvider(provider)) {
    const IconComponent = getConnectorProviderLogoWithFallback({
      provider,
      fallback: DocumentIcon,
    });
    return IconComponent;
  }
  return DocumentIcon;
}
