import type { IntegrationBase } from "@app/components/home/content/Integration/types";
import { buildIntegrationRegistry } from "@app/components/home/content/Integration/utils/integrationRegistry";

export function buildPublicIntegrationRegistry(): IntegrationBase[] {
  return buildIntegrationRegistry();
}
