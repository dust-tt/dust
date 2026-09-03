import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import { SummaryCard } from "@app/components/workspace/analytics/SummaryCard";
import { APIKeyCreationSheet } from "@app/components/workspace/api-keys/APIKeyCreationSheet";
import { APIKeysTable } from "@app/components/workspace/api-keys/APIKeysTable";
import { EditKeyCapDialog } from "@app/components/workspace/api-keys/EditKeyCapDialog";
import { EditKeyCreditCapDialog } from "@app/components/workspace/api-keys/EditKeyCreditCapDialog";
import { NewAPIKeyDialog } from "@app/components/workspace/api-keys/NewAPIKeyDialog";
import type { KeyRole } from "@app/components/workspace/api-keys/utils";
import { useConsumptionTop } from "@app/hooks/useConsumptionTop";
import { useSendNotification } from "@app/hooks/useNotification";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { formatCredits } from "@app/lib/client/credits";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { useKeys } from "@app/lib/swr/apps";
import { useKeyScopableSpaces } from "@app/lib/swr/spaces";
import type { ConsumptionScopeFilter } from "@app/types/api/analytics/consumption";
import type { KeyType } from "@app/types/key";
import { isCreditPricedPlan } from "@app/types/plan";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import { BookOpen01, Button, LoadingBlock, Page } from "@dust-tt/sparkle";
import get from "lodash/get";
import { useMemo, useState } from "react";
import { useSWRConfig } from "swr";

interface APIKeysPageContentProps {
  owner: WorkspaceType;
  period: ConsumptionPeriodSelection;
}

const MAX_API_KEY_CONSUMPTION_ROWS = 100;

interface APIKeysOverviewProps {
  keys: KeyType[];
  workspaceId: WorkspaceType["sId"];
  period: ConsumptionPeriodSelection;
  isKeysLoading: boolean;
}

function APIKeysOverview({
  keys,
  workspaceId,
  period,
  isKeysLoading,
}: APIKeysOverviewProps) {
  const apiKeyNames = useMemo(
    () => [...new Set(keys.map((key) => key.name))].sort(),
    [keys]
  );
  const consumptionFilter = useMemo<ConsumptionScopeFilter | undefined>(
    () => (apiKeyNames.length > 0 ? { api_keys: apiKeyNames } : undefined),
    [apiKeyNames]
  );
  const {
    totalCredits,
    totalCount: consumingKeyCount,
    isTopLoading: isConsumptionLoading,
    isTopError: consumptionError,
  } = useConsumptionTop({
    workspaceId,
    dimension: "api_key",
    period,
    limit: Math.max(
      1,
      Math.min(apiKeyNames.length, MAX_API_KEY_CONSUMPTION_ROWS)
    ),
    filter: consumptionFilter,
    disabled: apiKeyNames.length === 0,
  });
  if (isKeysLoading || isConsumptionLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <LoadingBlock className="h-24 rounded-xl" />
        <LoadingBlock className="h-24 rounded-xl" />
      </div>
    );
  }

  const activeKeyCount = keys.filter((key) => key.status === "active").length;
  const cappedKeyCount = keys.filter(
    (key) => key.status === "active" && key.creditState === "capped"
  ).length;
  const revokedKeyCount = keys.length - activeKeyCount;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SummaryCard
        label="Credits"
        value={consumptionError ? "—" : formatCredits(totalCredits)}
        hint={
          consumptionError
            ? "Credit consumption is temporarily unavailable"
            : consumingKeyCount > 0
              ? `${consumingKeyCount.toLocaleString()} API key${pluralize(consumingKeyCount)} used this period`
              : "No API key consumption this period"
        }
      />
      <SummaryCard
        label="Keys active"
        value={`${activeKeyCount.toLocaleString()} / ${keys.length.toLocaleString()}`}
        hint={
          cappedKeyCount > 0
            ? `${cappedKeyCount.toLocaleString()} at the monthly cap`
            : revokedKeyCount > 0
              ? `${revokedKeyCount.toLocaleString()} revoked`
              : null
        }
      />
    </div>
  );
}

export function APIKeysPageContent({ owner, period }: APIKeysPageContentProps) {
  const { mutate } = useSWRConfig();
  const { subscription } = useAuth();
  const showLegacyUsdMonthlyCap = !isCreditPricedPlan(subscription.plan);
  const showCreditMonthlyCap = isCreditPricedPlan(subscription.plan);
  const [isNewApiKeyCreatedOpen, setIsNewApiKeyCreatedOpen] = useState(false);
  const [editCapKey, setEditCapKey] = useState<KeyType | null>(null);

  const { isKeysError, isKeysLoading, keys } = useKeys(owner);
  const { spaces, isSpacesError, isSpacesLoading } = useKeyScopableSpaces({
    owner,
  });

  const sendNotification = useSendNotification();

  const { submit: handleGenerate, isSubmitting: isGenerating } =
    useSubmitFunction(
      async ({
        name,
        spaceIds,
        monthlyCapMicroUsd,
        monthlyCapAwuCredits,
        role,
      }: {
        name: string;
        spaceIds: string[];
        monthlyCapMicroUsd: number | null;
        monthlyCapAwuCredits: number | null;
        role: KeyRole;
      }) => {
        const response = await clientFetch(`/api/w/${owner.sId}/keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            space_ids: spaceIds,
            monthly_cap_micro_usd: monthlyCapMicroUsd,
            monthly_cap_awu_credits: monthlyCapAwuCredits,
            role,
          }),
        });
        await mutate(`/api/w/${owner.sId}/keys`);
        if (response.status >= 200 && response.status < 300) {
          setIsNewApiKeyCreatedOpen(true);
          sendNotification({
            title: "API Key Created",
            description:
              "Your API key will remain visible for 10 minutes only. You can use it to authenticate with the Dust API.",
            type: "success",
          });
          return;
        }
        const errorResponse = await response.json();
        sendNotification({
          title: "Error creating API key",
          description: get(errorResponse, "error.message", "Unknown error"),
          type: "error",
        });
      }
    );

  const { submit: handleRevoke, isSubmitting: isRevoking } = useSubmitFunction(
    async (key: KeyType) => {
      await clientFetch(`/api/w/${owner.sId}/keys/${key.id}/disable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      await mutate(`/api/w/${owner.sId}/keys`);
    }
  );

  const { submit: handleUpdateCap, isSubmitting: isUpdatingCap } =
    useSubmitFunction(async (monthlyCapMicroUsd: number | null) => {
      if (!editCapKey) {
        return;
      }
      const response = await clientFetch(
        `/api/w/${owner.sId}/keys/${editCapKey.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ monthly_cap_micro_usd: monthlyCapMicroUsd }),
        }
      );
      await mutate(`/api/w/${owner.sId}/keys`);
      if (response.ok) {
        sendNotification({
          title: "Monthly cap updated",
          type: "success",
        });
        setEditCapKey(null);
      } else {
        const errorResponse = await response.json();
        sendNotification({
          title: "Error updating monthly cap",
          description: get(errorResponse, "error.message", "Unknown error"),
          type: "error",
        });
      }
    });

  const { submit: handleUpdateCreditCap, isSubmitting: isUpdatingCreditCap } =
    useSubmitFunction(async (monthlyCapAwuCredits: number | null) => {
      if (!editCapKey) {
        return;
      }
      const response = await clientFetch(
        `/api/w/${owner.sId}/keys/${editCapKey.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            monthly_cap_awu_credits: monthlyCapAwuCredits,
          }),
        }
      );
      await mutate(`/api/w/${owner.sId}/keys`);
      if (response.ok) {
        sendNotification({
          title: "Credit cap updated",
          type: "success",
        });
        setEditCapKey(null);
      } else {
        const errorResponse = await response.json();
        sendNotification({
          title: "Error updating credit cap",
          description: get(errorResponse, "error.message", "Unknown error"),
          type: "error",
        });
      }
    });

  return (
    <>
      <APIKeyCreationSheet
        isOpen={isNewApiKeyCreatedOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsNewApiKeyCreatedOpen(false);
          }
        }}
        latestKey={keys[0]}
        workspace={owner}
      />
      <Page.Vertical align="stretch" gap="xl">
        <Page.Horizontal align="right">
          <Button
            label="API reference"
            size="sm"
            variant="outline"
            icon={BookOpen01}
            href="https://docs.dust.tt/reference"
            target="_blank"
            rel="noreferrer"
          />
          <NewAPIKeyDialog
            spaces={spaces}
            disabled={isSpacesLoading || isSpacesError}
            isGenerating={isGenerating}
            isRevoking={isRevoking}
            onCreate={handleGenerate}
            showLegacyUsdMonthlyCap={showLegacyUsdMonthlyCap}
          />
        </Page.Horizontal>
        {!isKeysError && (
          <APIKeysOverview
            keys={keys}
            workspaceId={owner.sId}
            period={period}
            isKeysLoading={isKeysLoading}
          />
        )}
        <APIKeysTable
          keys={keys}
          workspaceId={owner.sId}
          period={period}
          isLoading={isKeysLoading}
          isError={!!isKeysError}
          showAnalyticsConsumption
          isRevoking={isRevoking}
          isGenerating={isGenerating}
          onRevoke={handleRevoke}
          onEditCap={setEditCapKey}
          showLegacyUsdMonthlyCap={showLegacyUsdMonthlyCap}
          showCreditMonthlyCap={showCreditMonthlyCap}
        />
      </Page.Vertical>
      {showLegacyUsdMonthlyCap && editCapKey && (
        <EditKeyCapDialog
          keyData={editCapKey}
          isOpen={!!editCapKey}
          onClose={() => setEditCapKey(null)}
          onSave={handleUpdateCap}
          isSaving={isUpdatingCap}
        />
      )}
      {showCreditMonthlyCap && editCapKey && (
        <EditKeyCreditCapDialog
          keyData={editCapKey}
          isOpen={!!editCapKey}
          onClose={() => setEditCapKey(null)}
          onSave={handleUpdateCreditCap}
          isSaving={isUpdatingCreditCap}
        />
      )}
    </>
  );
}

export function APIKeysPage() {
  const owner = useWorkspace();
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );

  return (
    <Page.Vertical gap="xl" align="stretch">
      <Page.Header
        title={
          <div className="flex w-full flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="flex max-w-2xl flex-col gap-1">
              <Page.H variant="h3">Dust API Keys</Page.H>
              <Page.P variant="secondary">
                Create and manage keys for accessing the Dust API, track usage,
                and control monthly spend.
              </Page.P>
            </div>
            <ConsumptionPeriodSelector
              period={period}
              onPeriodChange={setPeriod}
            />
          </div>
        }
      />
      <APIKeysPageContent owner={owner} period={period} />
    </Page.Vertical>
  );
}
