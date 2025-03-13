export type LabsTranscriptsConfigurationType = {
  id: string;
  workspaceId: string;
  connectionId: string | null;
  provider: string;
  agentConfigurationId: string | null;
  isActive: boolean;
  isDefaultWorkspaceConfiguration: boolean;
  isDefaultFullStorage: boolean;
  credentialId: string | null;
  dataSourceViewId: string | null;
  useConnectorConnection: boolean;
};
