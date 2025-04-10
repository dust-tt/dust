import {
  BracesIcon,
  Button,
  ChatBubbleThoughtIcon,
  Chip,
  CommandIcon,
  CommandLineIcon,
  ExternalLinkIcon,
  FolderIcon,
  Icon,
  IconButton,
  Label,
  PlanetIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SparklesIcon,
  Tree,
} from "@dust-tt/sparkle";
import _ from "lodash";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import { DataSourceViewPermissionTree } from "@app/components/DataSourceViewPermissionTree";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { DustAppRunConfigurationType } from "@app/lib/actions/dust_app_run";
import type {
  DataSourceConfiguration,
  RetrievalConfigurationType,
} from "@app/lib/actions/retrieval";
import type { TablesQueryConfigurationType } from "@app/lib/actions/tables_query";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import {
  isBrowseConfiguration,
  isDustAppRunConfiguration,
  isMCPServerConfiguration,
  isProcessConfiguration,
  isReasoningConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  isWebsearchConfiguration,
} from "@app/lib/actions/types/guards";
import { getContentNodeInternalIdFromTableId } from "@app/lib/api/content_nodes";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import {
  canBeExpanded,
  getDisplayNameForDataSource,
} from "@app/lib/data_sources";
import {
  useDataSourceViewContentNodes,
  useDataSourceViews,
} from "@app/lib/swr/data_source_views";
import { classNames } from "@app/lib/utils";
import { setQueryParam } from "@app/lib/utils/router";
import type {
  AgentConfigurationType,
  ConnectorProvider,
  ContentNodesViewType,
  DataSourceTag,
  DataSourceViewType,
  LightWorkspaceType,
  TagsFilter,
} from "@app/types";
import {
  assertNever,
  DocumentViewRawContentKey,
  GLOBAL_AGENTS_SID,
} from "@app/types";

interface AssistantCapabilitiesSectionProps {
  agentConfiguration: AgentConfigurationType;
  owner: LightWorkspaceType;
}

export function AssistantCapabilitiesSection({
  agentConfiguration,
  owner,
}: AssistantCapabilitiesSectionProps) {
  if (agentConfiguration.actions.length === 0) {
    return null;
  }

  return <>Capabilities</>;
}
