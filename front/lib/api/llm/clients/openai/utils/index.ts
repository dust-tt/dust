import { ModelProviderIdType } from "@app/lib/resources/storage/models/workspace";

export function baseURLFromProviderId(
  providerId: ModelProviderIdType
): string | undefined {
  switch (providerId) {
    default:
      return undefined;
  }
}
