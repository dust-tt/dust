import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

import { filterModelProviders, getProviderLLMModels } from "@app/lib/providers";
import { useProviders } from "@app/lib/swr/apps";
import type { WorkspaceType } from "@app/types";

export default function ModelPicker({
  owner,
  model,
  readOnly,
  isAdmin,
  onModelUpdate,
  chatOnly,
  embedOnly,
}: {
  owner: WorkspaceType;
  model: {
    provider_id: string;
    model_id: string;
  };
  readOnly: boolean;
  isAdmin: boolean;
  onModelUpdate: (model: { provider_id: string; model_id: string }) => void;
  chatOnly?: boolean;
  embedOnly?: boolean;
}) {
  const { providers, isProvidersLoading } = useProviders({
    owner,
    disabled: readOnly,
  });

  const modelProviders = filterModelProviders(
    providers,
    !!chatOnly,
    !!embedOnly
  );

  const [providerModels, setProviderModels] = useState<Record<string, any[]>>(
    {}
  );
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const fetchModelsForProvider = useCallback(
    async (providerId: string) => {
      if (providerModels[providerId] || loadingProvider === providerId) {
        return;
      }

      setLoadingProvider(providerId);
      const result = await getProviderLLMModels(
        owner,
        providerId,
        !!chatOnly,
        !!embedOnly
      );

      if (result.models) {
        setProviderModels((prev) => ({
          ...prev,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          [providerId]: result.models || [], // Ensure we never set undefined
        }));
      }
      setLoadingProvider(null);
    },
    [owner, chatOnly, embedOnly, providerModels, loadingProvider]
  );

  return (
    <div className="flex items-center">
      {modelProviders.length === 0 &&
      !(model.provider_id && model.provider_id.length > 0) &&
      !readOnly ? (
        isAdmin ? (
          <Button
            href={`/w/${owner.sId}/developers/providers`}
            label={isProvidersLoading ? "Loading..." : "Setup provider"}
            size="xs"
          />
        ) : (
          <div className="inline-flex items-center rounded-md border border-white px-3 py-1 text-sm font-normal text-gray-300">
            No Provider available
          </div>
        )
      ) : readOnly ? (
        <div className="flex items-center gap-2">
          <div className="text-sm font-bold text-gray-700">
            {model.provider_id}
          </div>
          {model.model_id && (
            <>
              <span className="text-gray-400">/</span>
              <div className="text-sm font-bold text-gray-700">
                {model.model_id}
              </div>
            </>
          )}
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              isSelect
              variant="outline"
              label={
                model.provider_id
                  ? `${model.provider_id}${model.model_id ? ` / ${model.model_id}` : ""}`
                  : "Select provider"
              }
              size="xs"
            />
          </DropdownMenuTrigger>

          <DropdownMenuContent>
            {modelProviders.map((p) => (
              <DropdownMenuSub
                key={p.providerId}
                onOpenChange={(open) => {
                  if (open) {
                    void fetchModelsForProvider(p.providerId);
                  }
                }}
              >
                <DropdownMenuSubTrigger label={p.providerId} />
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    {loadingProvider === p.providerId ? (
                      <DropdownMenuItem
                        label="Loading models..."
                        disabled={true}
                      />
                    ) : (
                      providerModels[p.providerId]?.map((m) => (
                        <DropdownMenuItem
                          key={m.id}
                          label={m.id}
                          onClick={() =>
                            onModelUpdate({
                              provider_id: p.providerId,
                              model_id: m.id,
                            })
                          }
                        />
                      ))
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
