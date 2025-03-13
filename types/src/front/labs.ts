import { ModelId } from "../shared/model_id";

export type LabsTranscriptsConfigurationType = {
  id: ModelId;
  workspaceId: ModelId;
  connectionId: string | null;
  provider: "google_drive" | "gong" | "modjo";
  agentConfigurationId: string | null;
  isActive: boolean;
  isDefaultWorkspaceConfiguration: boolean;
  credentialId: string | null;
  dataSourceViewId: ModelId | null;
  useConnectorConnection: boolean;
};
