import { AgentResource } from "@app/lib/resources/agent_resource";
import type { AgentFetchVariant } from "@app/types/assistant/agent";

// Compatibility entry points; AgentResource owns configuration reads and mutations.
export function createPendingAgentConfiguration(
  ...args: Parameters<typeof AgentResource.createPendingAgentConfiguration>
): ReturnType<typeof AgentResource.createPendingAgentConfiguration> {
  return AgentResource.createPendingAgentConfiguration(...args);
}

export function getAgentConfigurationsWithVersion<V extends AgentFetchVariant>(
  ...args: Parameters<typeof AgentResource.getAgentConfigurationsWithVersion<V>>
): ReturnType<typeof AgentResource.getAgentConfigurationsWithVersion<V>> {
  return AgentResource.getAgentConfigurationsWithVersion<V>(...args);
}

export function listsAgentConfigurationVersions<V extends AgentFetchVariant>(
  ...args: Parameters<typeof AgentResource.listsAgentConfigurationVersions<V>>
): ReturnType<typeof AgentResource.listsAgentConfigurationVersions<V>> {
  return AgentResource.listsAgentConfigurationVersions<V>(...args);
}

export function fetchFirstVersionCreatedAtByAgentId(
  ...args: Parameters<typeof AgentResource.fetchFirstVersionCreatedAtByAgentId>
): ReturnType<typeof AgentResource.fetchFirstVersionCreatedAtByAgentId> {
  return AgentResource.fetchFirstVersionCreatedAtByAgentId(...args);
}

export function getAgentConfigurations<V extends AgentFetchVariant>(
  ...args: Parameters<typeof AgentResource.getAgentConfigurations<V>>
): ReturnType<typeof AgentResource.getAgentConfigurations<V>> {
  return AgentResource.getAgentConfigurations<V>(...args);
}

export function getAgentConfiguration<V extends AgentFetchVariant>(
  ...args: Parameters<typeof AgentResource.getAgentConfiguration<V>>
): ReturnType<typeof AgentResource.getAgentConfiguration<V>> {
  return AgentResource.getAgentConfiguration<V>(...args);
}

export function getAgentConfigurationForDetails(
  ...args: Parameters<typeof AgentResource.getAgentConfigurationForDetails>
): ReturnType<typeof AgentResource.getAgentConfigurationForDetails> {
  return AgentResource.getAgentConfigurationForDetails(...args);
}

export function getAgentLabelsByIds(
  ...args: Parameters<typeof AgentResource.getAgentLabelsByIds>
): ReturnType<typeof AgentResource.getAgentLabelsByIds> {
  return AgentResource.getAgentLabelsByIds(...args);
}

export function searchAgentConfigurationsByName(
  ...args: Parameters<typeof AgentResource.searchAgentConfigurationsByName>
): ReturnType<typeof AgentResource.searchAgentConfigurationsByName> {
  return AgentResource.searchAgentConfigurationsByName(...args);
}

export function resolveAgentConfigurationIdByName(
  ...args: Parameters<typeof AgentResource.resolveAgentConfigurationIdByName>
): ReturnType<typeof AgentResource.resolveAgentConfigurationIdByName> {
  return AgentResource.resolveAgentConfigurationIdByName(...args);
}

export function createAgentConfiguration(
  ...args: Parameters<typeof AgentResource.createAgentConfiguration>
): ReturnType<typeof AgentResource.createAgentConfiguration> {
  return AgentResource.createAgentConfiguration(...args);
}

export function archiveAgentConfiguration(
  ...args: Parameters<typeof AgentResource.archiveAgentConfiguration>
): ReturnType<typeof AgentResource.archiveAgentConfiguration> {
  return AgentResource.archiveAgentConfiguration(...args);
}

export function restoreAgentConfiguration(
  ...args: Parameters<typeof AgentResource.restoreAgentConfiguration>
): ReturnType<typeof AgentResource.restoreAgentConfiguration> {
  return AgentResource.restoreAgentConfiguration(...args);
}

export function cleanupAgentScopedResourcesForHardDeletion(
  ...args: Parameters<
    typeof AgentResource.cleanupAgentScopedResourcesForHardDeletion
  >
): ReturnType<typeof AgentResource.cleanupAgentScopedResourcesForHardDeletion> {
  return AgentResource.cleanupAgentScopedResourcesForHardDeletion(...args);
}

export function unsafeHardDeleteAgentConfiguration(
  ...args: Parameters<typeof AgentResource.unsafeHardDeleteAgentConfiguration>
): ReturnType<typeof AgentResource.unsafeHardDeleteAgentConfiguration> {
  return AgentResource.unsafeHardDeleteAgentConfiguration(...args);
}

export function batchHardDeletePendingAgentConfigurations(
  ...args: Parameters<
    typeof AgentResource.batchHardDeletePendingAgentConfigurations
  >
): ReturnType<typeof AgentResource.batchHardDeletePendingAgentConfigurations> {
  return AgentResource.batchHardDeletePendingAgentConfigurations(...args);
}

export function updateAgentPermissions(
  ...args: Parameters<typeof AgentResource.updateAgentPermissions>
): ReturnType<typeof AgentResource.updateAgentPermissions> {
  return AgentResource.updateAgentPermissions(...args);
}

export function updateAgentConfigurationsScope(
  ...args: Parameters<typeof AgentResource.updateAgentConfigurationsScope>
): ReturnType<typeof AgentResource.updateAgentConfigurationsScope> {
  return AgentResource.updateAgentConfigurationsScope(...args);
}

export function filterAgentsByRequestedSpaces(
  ...args: Parameters<typeof AgentResource.filterAgentsByRequestedSpaces>
): ReturnType<typeof AgentResource.filterAgentsByRequestedSpaces> {
  return AgentResource.filterAgentsByRequestedSpaces(...args);
}
