import { AllProvidersToggle } from "@app/components/pages/workspace/model_providers/AllProvidersToggle";
import { EmbeddingModelSelect } from "@app/components/pages/workspace/model_providers/EmbeddingModelSelect";
import { ProvidersList } from "@app/components/pages/workspace/model_providers/ProvidersList";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { ProvidersSelection } from "@app/types/provider_selection";
import type { WorkspaceType } from "@app/types/user";
import type { Dispatch, SetStateAction } from "react";

interface ModelProvidersPageContentProps {
  workspace: WorkspaceType;
  setProvidersSelection: Dispatch<SetStateAction<ProvidersSelection>>;
  providersSelection: ProvidersSelection;
  isWorkspaceValidating: boolean;
}

export function ModelProvidersPageContent({
  workspace,
  setProvidersSelection,
  providersSelection,
  isWorkspaceValidating,
}: ModelProvidersPageContentProps) {
  const { subscription } = useAuth();
  const { plan } = subscription;

  return (
    <div className="flex flex-col gap-8">
      <AllProvidersToggle
        providersSelection={providersSelection}
        setProvidersSelection={setProvidersSelection}
      />
      <ProvidersList
        providersSelection={providersSelection}
        setProvidersSelection={setProvidersSelection}
        isWorkspaceValidating={isWorkspaceValidating}
        plan={plan}
      />
      <EmbeddingModelSelect workspace={workspace} />
    </div>
  );
}
