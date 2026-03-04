import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type {
  RedisCacheResult,
  RedisInstance,
} from "@app/pages/api/poke/cache";
import {
  usePokeCacheInvalidate,
  usePokeCacheLookup,
} from "@app/poke/swr/cache";
import type { CacheResourceDefinition } from "@app/types/shared/cache_resource_registry";
import {
  buildCacheKey,
  CACHE_RESOURCE_REGISTRY,
} from "@app/types/shared/cache_resource_registry";
import {
  Button,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";
import { useCallback, useState } from "react";

function formatTtl(ttlSeconds: number): string {
  if (ttlSeconds === -2) {
    return "Key does not exist";
  }
  if (ttlSeconds === -1) {
    return "No TTL (LRU cache)";
  }
  const minutes = Math.floor(ttlSeconds / 60);
  const seconds = ttlSeconds % 60;
  if (minutes > 0) {
    return `${minutes} min ${seconds} sec`;
  }
  return `${seconds} sec`;
}

interface RedisInstanceResultProps {
  label: string;
  result: RedisCacheResult;
  onInvalidate: () => Promise<void>;
  isInvalidating: boolean;
}

function RedisInstanceResult({
  label,
  result,
  onInvalidate,
  isInvalidating,
}: RedisInstanceResultProps) {
  const { isDark } = useTheme();
  const [showConfirm, setShowConfirm] = useState(false);
  const found = result.value !== null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground dark:text-foreground-night">
          {label}
        </h3>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
            found
              ? "bg-success-100 text-success-800 dark:bg-success-100-night dark:text-success-800-night"
              : "bg-muted-background text-muted-foreground dark:bg-muted-background-night dark:text-muted-foreground-night"
          }`}
        >
          {found ? "Found" : "Not found"}
        </span>
      </div>
      {found && (
        <>
          <div>
            <Label isMuted>TTL</Label>
            <p className="mt-1 text-sm text-foreground dark:text-foreground-night">
              {formatTtl(result.ttlSeconds)}
            </p>
          </div>
          <div>
            <Label isMuted>Value</Label>
            <JsonViewer
              theme={isDark ? "dark" : "light"}
              value={result.value}
              rootName={false}
              defaultInspectDepth={2}
              className="mt-1"
            />
          </div>
          <Button
            label={isInvalidating ? "Invalidating..." : "Invalidate"}
            variant="warning"
            size="sm"
            disabled={isInvalidating}
            onClick={() => setShowConfirm(true)}
          />
          <Dialog
            open={showConfirm}
            onOpenChange={(open) => {
              if (!open) {
                setShowConfirm(false);
              }
            }}
          >
            <DialogContent size="md" isAlertDialog>
              <DialogHeader hideButton>
                <DialogTitle>Invalidate cache key?</DialogTitle>
              </DialogHeader>
              <DialogContainer>
                <p>
                  This will delete the key from{" "}
                  <span className="font-bold">{label}</span>. This action cannot
                  be undone.
                </p>
              </DialogContainer>
              <DialogFooter
                leftButtonProps={{
                  label: "Cancel",
                  variant: "outline",
                }}
                rightButtonProps={{
                  label: "Invalidate",
                  variant: "warning",
                  onClick: async () => {
                    await onInvalidate();
                    setShowConfirm(false);
                  },
                }}
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

interface CacheResultsProps {
  data: {
    key: string;
    cacheRedis: RedisCacheResult;
    streamRedis: RedisCacheResult;
  } | null;
  isLoading: boolean;
  isError: unknown;
  submitted: boolean;
  onInvalidate: (redisInstance: RedisInstance) => Promise<void>;
  isInvalidating: boolean;
}

function CacheResults({
  data,
  isLoading,
  isError,
  submitted,
  onInvalidate,
  isInvalidating,
}: CacheResultsProps) {
  if (!submitted) {
    return (
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Fill in the parameters and click Lookup to see results.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-warning-400 dark:text-warning-400-night">
        Error fetching cache value.
      </p>
    );
  }

  if (!data) {
    return null;
  }

  const foundInCache = data.cacheRedis.value !== null;
  const foundInStream = data.streamRedis.value !== null;

  const summaryMessage = (() => {
    if (foundInCache && foundInStream) {
      return "Found in both Cache Redis (REDIS_CACHE_URI) and Stream Redis (REDIS_URI).";
    }
    if (foundInCache) {
      return "Found in Cache Redis (REDIS_CACHE_URI).";
    }
    if (foundInStream) {
      return "Found in Stream Redis (REDIS_URI).";
    }
    return "Did not find any result across Cache Redis and Stream Redis. Are you looking in the right region? Change region in the top-right corner.";
  })();

  return (
    <div className="space-y-6">
      <ContentMessage
        variant={foundInCache || foundInStream ? "success" : "warning"}
        size="lg"
        title={summaryMessage}
      />
      <div>
        <Label isMuted>Redis Key</Label>
        <code className="mt-1 block break-all rounded bg-muted-background p-2 text-sm text-foreground dark:bg-muted-background-night dark:text-foreground-night">
          {data.key}
        </code>
      </div>
      {(foundInCache || foundInStream) && (
        <div className="grid grid-cols-2 gap-6">
          {foundInCache && (
            <RedisInstanceResult
              label="Cache Redis (REDIS_CACHE_URI)"
              result={data.cacheRedis}
              onInvalidate={() => onInvalidate("cache")}
              isInvalidating={isInvalidating}
            />
          )}
          {foundInStream && (
            <RedisInstanceResult
              label="Stream Redis (REDIS_URI)"
              result={data.streamRedis}
              onInvalidate={() => onInvalidate("stream")}
              isInvalidating={isInvalidating}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Lookup query: either a raw key or a resource with params.
type LookupQuery =
  | { type: "raw"; rawKey: string }
  | {
      type: "resource";
      resourceId: string;
      params: Record<string, string>;
    };

interface ResourceLookupFormProps {
  onSubmit: (query: LookupQuery) => void;
}

function ResourceLookupForm({ onSubmit }: ResourceLookupFormProps) {
  const [selectedResource, setSelectedResource] =
    useState<CacheResourceDefinition | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});

  const allParamsFilled =
    selectedResource !== null &&
    selectedResource.params.every((p) => paramValues[p.key]?.trim());

  const computedKey =
    selectedResource && allParamsFilled
      ? buildCacheKey(selectedResource, paramValues)
      : null;

  function handleSelectResource(resource: CacheResourceDefinition) {
    setSelectedResource(resource);
    setParamValues({});
  }

  function handleParamChange(key: string, value: string) {
    setParamValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleLookup() {
    if (selectedResource && allParamsFilled) {
      onSubmit({
        type: "resource",
        resourceId: selectedResource.id,
        params: paramValues,
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && allParamsFilled) {
      handleLookup();
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div>
        <Label className="mb-1 block">Resource Type</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              isSelect
              label={selectedResource?.label ?? "Select a resource..."}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72">
            {CACHE_RESOURCE_REGISTRY.map((resource) => (
              <DropdownMenuItem
                key={resource.id}
                onClick={() => handleSelectResource(resource)}
              >
                {resource.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {selectedResource && (
        <>
          {selectedResource.params.map((param) => (
            <div key={param.key}>
              <Label className="mb-1">{param.label}</Label>
              <Input
                placeholder={param.placeholder}
                value={paramValues[param.key] ?? ""}
                onChange={(e) => handleParamChange(param.key, e.target.value)}
                onKeyDown={handleKeyDown}
                name={param.key}
              />
            </div>
          ))}

          {computedKey && (
            <div>
              <Label isMuted>Computed Key</Label>
              <code className="mt-1 block break-all rounded bg-muted-background p-2 text-xs text-muted-foreground dark:bg-muted-background-night dark:text-muted-foreground-night">
                {computedKey}
              </code>
            </div>
          )}

          <Button
            label="Lookup"
            onClick={handleLookup}
            disabled={!allParamsFilled}
            variant="primary"
          />
        </>
      )}
    </div>
  );
}

interface RawKeyFormProps {
  onSubmit: (query: LookupQuery) => void;
}

function RawKeyForm({ onSubmit }: RawKeyFormProps) {
  const [rawKey, setRawKey] = useState("");

  const canLookup = rawKey.trim().length > 0;

  function handleLookup() {
    if (canLookup) {
      onSubmit({ type: "raw", rawKey: rawKey.trim() });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canLookup) {
      handleLookup();
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div>
        <Label className="mb-1">Redis Key</Label>
        <Input
          placeholder="cacheWithRedis-_fetchByIdUncached-workspace:sid:abc123"
          value={rawKey}
          onChange={(e) => setRawKey(e.target.value)}
          onKeyDown={handleKeyDown}
          name="rawKey"
        />
      </div>

      <Button
        label="Lookup"
        onClick={handleLookup}
        disabled={!canLookup}
        variant="primary"
      />
    </div>
  );
}

export function CacheLookupPage() {
  useSetPokePageTitle("Cache Lookup");

  const [query, setQuery] = useState<LookupQuery | null>(null);

  const { data, isCacheLoading, isCacheError, mutateCache } =
    usePokeCacheLookup({
      rawKey: query?.type === "raw" ? query.rawKey : undefined,
      resourceId: query?.type === "resource" ? query.resourceId : undefined,
      params: query?.type === "resource" ? query.params : undefined,
      disabled: !query,
    });

  const { doInvalidate, isInvalidating } = usePokeCacheInvalidate();

  const handleInvalidate = useCallback(
    async (redisInstance: RedisInstance) => {
      if (!query) {
        return;
      }
      const success = await doInvalidate({
        rawKey: query.type === "raw" ? query.rawKey : undefined,
        resourceId: query.type === "resource" ? query.resourceId : undefined,
        params: query.type === "resource" ? query.params : undefined,
        redisInstance,
      });
      if (success) {
        await mutateCache();
      }
    },
    [query, doInvalidate, mutateCache]
  );

  return (
    <main className="px-4 sm:px-6 lg:px-8">
      <div className="py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground dark:text-foreground-night">
            Redis Cache Lookup
          </h1>
          <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
            Inspect cached values in Redis
          </p>
        </div>

        <div className="flex gap-6">
          <div className="w-80 shrink-0 rounded-lg bg-background p-4 dark:bg-background-night">
            <Tabs defaultValue="resource">
              <TabsList>
                <TabsTrigger value="resource" label="Resource Lookup" />
                <TabsTrigger value="raw" label="Raw Key" />
              </TabsList>

              <TabsContent value="resource">
                <ResourceLookupForm onSubmit={setQuery} />
              </TabsContent>

              <TabsContent value="raw">
                <RawKeyForm onSubmit={setQuery} />
              </TabsContent>
            </Tabs>
          </div>

          <div className="min-w-0 flex-1 rounded-lg bg-background p-4 dark:bg-background-night">
            <CacheResults
              data={data}
              isLoading={isCacheLoading}
              isError={isCacheError}
              submitted={query !== null}
              onInvalidate={handleInvalidate}
              isInvalidating={isInvalidating}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
