import type { ModelId } from "@app/types";

// TODO Daph refactor this we could simplify this.
export type DustAppRunConfigurationType = {
  id: ModelId;
  sId: string;

  type: "dust_app_run_configuration";

  appWorkspaceId: string;
  appId: string;

  name: string;
  description: string | null;
};
