import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetDataSourceUsageResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/usage";
import type { GetBotDataSourcesResponseBody } from "@app/pages/api/w/[wId]/data_sources/bot-data-sources";
import type { GetPostNotionSyncResponseBody } from "@app/types/api/internal/spaces";
import type { DataSourceType } from "@app/types/data_source";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function useDataSourceUsage({
  owner,
  dataSource,
}: {
  owner: LightWorkspaceType;
  dataSource: DataSourceType;
}) {
  const usageFetcher: Fetcher<GetDataSourceUsageResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/data_sources/${dataSource.sId}/usage`,
    usageFetcher
  );

  return {
    usage: data?.usage ?? null,
    isUsageLoading: !error && !data,
    isUsageError: error,
    mutate,
  };
}

export function useNotionLastSyncedUrls({
  owner,
  dataSource,
}: {
  owner: LightWorkspaceType;
  dataSource: DataSourceType;
}): {
  lastSyncedUrls: GetPostNotionSyncResponseBody["syncResults"];
  isLoading: boolean;
  isError: boolean;
  mutate: () => Promise<void>;
} {
  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/notion_url_sync`,
    fetcher
  );

  return {
    lastSyncedUrls: data?.syncResults,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useBotDataSources({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const botDataSourcesFetcher: Fetcher<GetBotDataSourcesResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/data_sources/bot-data-sources`,
    botDataSourcesFetcher,
    { disabled }
  );

  return {
    slackBotDataSource: data?.slackBotDataSource ?? null,
    microsoftBotDataSource: data?.microsoftBotDataSource ?? null,
    discordBotDataSource: data?.discordBotDataSource ?? null,
    isBotDataSourcesLoading: !error && !data && !disabled,
    isBotDataSourcesError: error,
  };
}
