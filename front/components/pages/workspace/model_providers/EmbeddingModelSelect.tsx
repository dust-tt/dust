import { EMBEDDING_PROVIDER_IDS } from "@app/types/assistant/models/embedding";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { PRETTIFIED_PROVIDER_NAMES } from "@app/types/provider_selection";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface EmbeddingModelSelectProps {
  workspace?: WorkspaceType;
}

const DEFAULT_EMBEDDING_PROVIDER: ModelProviderIdType = "openai";

export function EmbeddingModelSelect({ workspace }: EmbeddingModelSelectProps) {
  const [embeddingProvider, setEmbeddingProvider] =
    useState<ModelProviderIdType>(DEFAULT_EMBEDDING_PROVIDER);

  useEffect(() => {
    if (workspace?.defaultEmbeddingProvider) {
      setEmbeddingProvider(workspace.defaultEmbeddingProvider);
    }
  }, [workspace?.defaultEmbeddingProvider]);

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Embedding Provider:</div>
        <DropdownMenu>
          <DropdownMenuTrigger disabled>
            <Button
              disabled
              tooltip="Please contact us if you are willing to change this setting."
              isSelect
              label={PRETTIFIED_PROVIDER_NAMES[embeddingProvider]}
              variant="outline"
              size="sm"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {EMBEDDING_PROVIDER_IDS.map((provider) => (
              <DropdownMenuItem
                key={provider}
                label={PRETTIFIED_PROVIDER_NAMES[provider]}
                onClick={() => {
                  setEmbeddingProvider(provider);
                }}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="text-sm text-gray-500">
        Embedding models are used to create numerical representations of your
        data powering the semantic search capabilities of your agents.
      </div>
    </div>
  );
}
