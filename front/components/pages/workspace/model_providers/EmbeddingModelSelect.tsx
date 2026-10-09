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
  SettingsList,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

interface EmbeddingModelSelectProps {
  workspace?: WorkspaceType;
}

const DEFAULT_EMBEDDING_PROVIDER: ModelProviderIdType = "openai";

export function EmbeddingModelSelect({ workspace }: EmbeddingModelSelectProps) {
  const { t } = useLingui();
  const [embeddingProvider, setEmbeddingProvider] =
    useState<ModelProviderIdType>(DEFAULT_EMBEDDING_PROVIDER);

  useEffect(() => {
    if (workspace?.defaultEmbeddingProvider) {
      setEmbeddingProvider(workspace.defaultEmbeddingProvider);
    }
  }, [workspace?.defaultEmbeddingProvider]);

  return (
    <>
      <div className="heading-base text-foreground">
        <Trans>Embedding provider</Trans>
      </div>
      <SettingsList>
        <SettingsList.Row
          title={t`Embedding provider`}
          description={
            <Trans>
              Embedding models are used to create numerical representations of
              your data powering the semantic search capabilities of your
              agents.
            </Trans>
          }
          action={
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled>
                <Button
                  disabled
                  tooltip={t`Please contact us if you want to change this setting.`}
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
          }
        />
      </SettingsList>
    </>
  );
}
