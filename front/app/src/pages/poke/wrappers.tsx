import { useParams, useSearchParams } from "react-router-dom";

import { AppPage } from "@app/components/poke/pages/AppPage";
import { AssistantDetailsPage } from "@app/components/poke/pages/AssistantDetailsPage";
import { ConversationPage } from "@app/components/poke/pages/ConversationPage";
import { DashboardPage } from "@app/components/poke/pages/DashboardPage";
import { DataSourcePage } from "@app/components/poke/pages/DataSourcePage";
import { DataSourceQueryPage } from "@app/components/poke/pages/DataSourceQueryPage";
import { DataSourceSearchPage } from "@app/components/poke/pages/DataSourceSearchPage";
import { DataSourceViewPage } from "@app/components/poke/pages/DataSourceViewPage";
import { EmailTemplatesPage } from "@app/components/poke/pages/EmailTemplatesPage";
import { GroupPage } from "@app/components/poke/pages/GroupPage";
import { KillPage } from "@app/components/poke/pages/KillPage";
import { LLMTracePage } from "@app/components/poke/pages/LLMTracePage";
import { MCPServerViewPage } from "@app/components/poke/pages/MCPServerViewPage";
import { MembershipsPage } from "@app/components/poke/pages/MembershipsPage";
import { NotionRequestsPage } from "@app/components/poke/pages/NotionRequestsPage";
import { PlansPage } from "@app/components/poke/pages/PlansPage";
import { PluginsPage } from "@app/components/poke/pages/PluginsPage";
import { PokefyPage } from "@app/components/poke/pages/PokefyPage";
import { ProductionChecksPage } from "@app/components/poke/pages/ProductionChecksPage";
import { SkillDetailsPage } from "@app/components/poke/pages/SkillDetailsPage";
import { SpaceDataSourceViewPage } from "@app/components/poke/pages/SpaceDataSourceViewPage";
import { SpacePage } from "@app/components/poke/pages/SpacePage";
import { TemplateDetailPage } from "@app/components/poke/pages/TemplateDetailPage";
import { TemplatesListPage } from "@app/components/poke/pages/TemplatesListPage";
import { TriggerDetailsPage } from "@app/components/poke/pages/TriggerDetailsPage";
import { WorkspacePage } from "@app/components/poke/pages/WorkspacePage";
import { useAuthWithWorkspace } from "@app/lib/auth/AuthContext";

// Error display
function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex h-64 items-center justify-center">
      <p className="text-red-500">{message}</p>
    </div>
  );
}

// Workspace Page Wrapper
export function PokeWorkspacePageWrapper() {
  const { workspace } = useAuthWithWorkspace();
  return <WorkspacePage owner={workspace} />;
}

// Memberships Page Wrapper
export function PokeMembershipsPageWrapper() {
  const { workspace } = useAuthWithWorkspace();
  return <MembershipsPage owner={workspace} />;
}

// LLM Trace Page Wrapper
export function PokeLLMTracePageWrapper() {
  const { runId } = useParams<{ runId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!runId) {
    return <ErrorDisplay message="Run ID is required" />;
  }

  return <LLMTracePage owner={workspace} runId={runId} />;
}

// Assistant Details Page Wrapper
export function PokeAssistantDetailsPageWrapper() {
  const { aId } = useParams<{ aId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!aId) {
    return <ErrorDisplay message="Assistant ID is required" />;
  }

  return <AssistantDetailsPage owner={workspace} aId={aId} />;
}

// Trigger Details Page Wrapper
export function PokeTriggerDetailsPageWrapper() {
  const { triggerId } = useParams<{ triggerId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!triggerId) {
    return <ErrorDisplay message="Trigger ID is required" />;
  }

  return <TriggerDetailsPage owner={workspace} triggerId={triggerId} />;
}

// Conversation Page Wrapper
export function PokeConversationPageWrapper() {
  const { cId } = useParams<{ cId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!cId) {
    return <ErrorDisplay message="Conversation ID is required" />;
  }

  return <ConversationPage owner={workspace} conversationId={cId} />;
}

// Data Source Page Wrapper
export function PokeDataSourcePageWrapper() {
  const { dsId } = useParams<{ dsId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!dsId) {
    return <ErrorDisplay message="Data Source ID is required" />;
  }

  return <DataSourcePage owner={workspace} dsId={dsId} />;
}

// Notion Requests Page Wrapper
export function PokeNotionRequestsPageWrapper() {
  const { dsId } = useParams<{ dsId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!dsId) {
    return <ErrorDisplay message="Data Source ID is required" />;
  }

  return <NotionRequestsPage owner={workspace} dsId={dsId} />;
}

// Data Source Query Page Wrapper
export function PokeDataSourceQueryPageWrapper() {
  const { dsId } = useParams<{ dsId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!dsId) {
    return <ErrorDisplay message="Data Source ID is required" />;
  }

  return <DataSourceQueryPage owner={workspace} dsId={dsId} />;
}

// Data Source Search Page Wrapper
export function PokeDataSourceSearchPageWrapper() {
  const { dsId } = useParams<{ dsId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!dsId) {
    return <ErrorDisplay message="Data Source ID is required" />;
  }

  return <DataSourceSearchPage owner={workspace} dsId={dsId} />;
}

// Data Source View Page Wrapper
export function PokeDataSourceViewPageWrapper() {
  const { dsId } = useParams<{ dsId: string }>();
  const [searchParams] = useSearchParams();
  const documentId = searchParams.get("documentId");
  const { workspace } = useAuthWithWorkspace();

  if (!dsId) {
    return <ErrorDisplay message="Data Source ID is required" />;
  }

  return (
    <DataSourceViewPage owner={workspace} dsId={dsId} documentId={documentId} />
  );
}

// Group Page Wrapper
export function PokeGroupPageWrapper() {
  const { groupId } = useParams<{ groupId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!groupId) {
    return <ErrorDisplay message="Group ID is required" />;
  }

  return <GroupPage owner={workspace} groupId={groupId} />;
}

// Skill Details Page Wrapper
export function PokeSkillDetailsPageWrapper() {
  const { sId } = useParams<{ sId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!sId) {
    return <ErrorDisplay message="Skill ID is required" />;
  }

  return <SkillDetailsPage owner={workspace} sId={sId} />;
}

// Space Page Wrapper
export function PokeSpacePageWrapper() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!spaceId) {
    return <ErrorDisplay message="Space ID is required" />;
  }

  return <SpacePage owner={workspace} spaceId={spaceId} />;
}

// App Page Wrapper
export function PokeAppPageWrapper() {
  const { appId } = useParams<{ appId: string }>();
  const [searchParams] = useSearchParams();
  const hash = searchParams.get("hash");
  const { workspace } = useAuthWithWorkspace();

  if (!appId) {
    return <ErrorDisplay message="App ID is required" />;
  }

  return <AppPage owner={workspace} appId={appId} hash={hash} />;
}

// Space Data Source View Page Wrapper
export function PokeSpaceDataSourceViewPageWrapper() {
  const { dsvId } = useParams<{ dsvId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!dsvId) {
    return <ErrorDisplay message="Data Source View ID is required" />;
  }

  return <SpaceDataSourceViewPage owner={workspace} dsvId={dsvId} />;
}

// MCP Server View Page Wrapper
export function PokeMCPServerViewPageWrapper() {
  const { svId } = useParams<{ svId: string }>();
  const { workspace } = useAuthWithWorkspace();

  if (!svId) {
    return <ErrorDisplay message="MCP Server View ID is required" />;
  }

  return <MCPServerViewPage owner={workspace} svId={svId} />;
}

// Dashboard Page Wrapper (no workspace context needed)
export function PokeDashboardPageWrapper() {
  return <DashboardPage />;
}

// Kill Page Wrapper (no workspace context needed)
export function PokeKillPageWrapper() {
  return <KillPage />;
}

// Plans Page Wrapper (no workspace context needed)
export function PokePlansPageWrapper() {
  return <PlansPage />;
}

// Pokefy Page Wrapper (no workspace context needed)
export function PokePokefyPageWrapper() {
  return <PokefyPage />;
}

// Production Checks Page Wrapper (no workspace context needed)
export function PokeProductionChecksPageWrapper() {
  return <ProductionChecksPage />;
}

// Email Templates Page Wrapper (no workspace context needed)
export function PokeEmailTemplatesPageWrapper() {
  return <EmailTemplatesPage />;
}

// Templates List Page Wrapper (no workspace context needed)
export function PokeTemplatesListPageWrapper() {
  return <TemplatesListPage />;
}

// Template Detail Page Wrapper (no workspace context needed)
export function PokeTemplateDetailPageWrapper() {
  const { tId } = useParams<{ tId: string }>();

  if (!tId) {
    return <ErrorDisplay message="Template ID is required" />;
  }

  return <TemplateDetailPage templateId={tId} />;
}

// Plugins Page Wrapper (no workspace context needed)
export function PokePluginsPageWrapper() {
  return <PluginsPage />;
}
