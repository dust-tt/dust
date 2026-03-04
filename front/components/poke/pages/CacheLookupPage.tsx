import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { RedisCacheResult } from "@app/pages/api/poke/cache";
import {
  usePokeCacheLookup,
  usePokeCacheResourceLookup,
} from "@app/poke/swr/cache";
import type { CacheResourceDefinition } from "@app/types/shared/cache_resource_registry";
import {
  buildCacheKey,
  CACHE_RESOURCE_REGISTRY,
} from "@app/types/shared/cache_resource_registry";
import {
  Button,
  ContentMessage,
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
import { useState } from "react";

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
}

function RedisInstanceResult({ label, result }: RedisInstanceResultProps) {
  const { isDark } = useTheme();
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
}

function CacheResults({
  data,
  isLoading,
  isError,
  submitted,
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
      {foundInCache && foundInStream ? (
        <div className="grid grid-cols-2 gap-6">
          <RedisInstanceResult
            label="Cache Redis (REDIS_CACHE_URI)"
            result={data.cacheRedis}
          />
          <RedisInstanceResult
            label="Stream Redis (REDIS_URI)"
            result={data.streamRedis}
          />
        </div>
      ) : foundInCache ? (
        <RedisInstanceResult
          label="Cache Redis (REDIS_CACHE_URI)"
          result={data.cacheRedis}
        />
      ) : foundInStream ? (
        <RedisInstanceResult
          label="Stream Redis (REDIS_URI)"
          result={data.streamRedis}
        />
      ) : null}
    </div>
  );
}

function ResourceLookupTab() {
  const [selectedResource, setSelectedResource] =
    useState<CacheResourceDefinition | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const allParamsFilled =
    selectedResource !== null &&
    selectedResource.params.every((p) => paramValues[p.key]?.trim());

  const computedKey =
    selectedResource && allParamsFilled
      ? buildCacheKey(selectedResource, paramValues)
      : null;

  const { data, isCacheLoading, isCacheError } = usePokeCacheResourceLookup({
    resourceId: selectedResource?.id,
    params: paramValues,
    disabled: !submitted || !allParamsFilled,
  });

  function handleSelectResource(resource: CacheResourceDefinition) {
    setSelectedResource(resource);
    setParamValues({});
    setSubmitted(false);
  }

  function handleParamChange(key: string, value: string) {
    setParamValues((prev) => ({ ...prev, [key]: value }));
    setSubmitted(false);
  }

  function handleLookup() {
    setSubmitted(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && allParamsFilled) {
      handleLookup();
    }
  }

  return (
    <div className="flex gap-6">
      {/* Left: Query */}
      <div className="w-80 shrink-0 space-y-4 rounded-lg bg-background p-5 dark:bg-background-night">
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

      {/* Right: Results */}
      <div className="min-w-0 flex-1 rounded-lg bg-background p-5 dark:bg-background-night">
        <CacheResults
          data={data}
          isLoading={isCacheLoading}
          isError={isCacheError}
          submitted={submitted && allParamsFilled}
        />
      </div>
    </div>
  );
}

function RawKeyTab() {
  const [rawKey, setRawKey] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const canLookup = rawKey.trim().length > 0;

  const { data, isCacheLoading, isCacheError } = usePokeCacheLookup({
    rawKey: rawKey.trim(),
    disabled: !submitted || !canLookup,
  });

  function handleLookup() {
    setSubmitted(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canLookup) {
      handleLookup();
    }
  }

  return (
    <div className="flex gap-6">
      {/* Left: Query */}
      <div className="w-80 shrink-0 space-y-4 rounded-lg bg-background p-5 dark:bg-background-night">
        <div>
          <Label className="mb-1">Redis Key</Label>
          <Input
            placeholder="e.g. cacheWithRedis-_fetchByIdUncached-workspace:sid:abc123"
            value={rawKey}
            onChange={(e) => {
              setRawKey(e.target.value);
              setSubmitted(false);
            }}
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

      {/* Right: Results */}
      <div className="min-w-0 flex-1 rounded-lg bg-background p-5 dark:bg-background-night">
        <CacheResults
          data={data}
          isLoading={isCacheLoading}
          isError={isCacheError}
          submitted={submitted && canLookup}
        />
      </div>
    </div>
  );
}

export function CacheLookupPage() {
  useSetPokePageTitle("Cache Lookup");

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

        <Tabs defaultValue="resource">
          <TabsList>
            <TabsTrigger value="resource" label="Resource Lookup" />
            <TabsTrigger value="raw" label="Raw Key" />
          </TabsList>

          <TabsContent value="resource">
            <ResourceLookupTab />
          </TabsContent>

          <TabsContent value="raw">
            <RawKeyTab />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
