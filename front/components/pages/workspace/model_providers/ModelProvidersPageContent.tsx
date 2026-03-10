import { AllProvidersToggle } from "@app/components/pages/workspace/model_providers/AllProvidersToggle";
import { EmbeddingModelSelect } from "@app/components/pages/workspace/model_providers/EmbeddingModelSelect";
import { ProvidersToggleList } from "@app/components/pages/workspace/model_providers/ProvidersToggleList";
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
      {plan.isByok ? (
        <></>
      ) : (
        <>
          <AllProvidersToggle
            providersSelection={providersSelection}
            setProvidersSelection={setProvidersSelection}
          />
          <ProvidersToggleList
            providersSelection={providersSelection}
            setProvidersSelection={setProvidersSelection}
            isWorkspaceValidating={isWorkspaceValidating}
            plan={plan}
          />
        </>
      )}
      <EmbeddingModelSelect workspace={workspace} />
    </div>
  );
}
