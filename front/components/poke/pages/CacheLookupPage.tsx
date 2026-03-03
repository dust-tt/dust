import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
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

interface CacheResultsProps {
  data: { key: string; value: unknown | null; ttlSeconds: number } | null;
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

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
          Redis Key
        </label>
        <code className="mt-1 block break-all rounded bg-muted-background p-2 text-sm text-foreground dark:bg-muted-background-night dark:text-foreground-night">
          {data.key}
        </code>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
          TTL
        </label>
        <p className="mt-1 text-sm text-foreground dark:text-foreground-night">
          {formatTtl(data.ttlSeconds)}
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
          Value
        </label>
        {data.value !== null ? (
          <pre className="mt-1 max-h-[60vh] overflow-auto rounded bg-muted-background p-3 text-xs text-foreground dark:bg-muted-background-night dark:text-foreground-night">
            {JSON.stringify(data.value, null, 2)}
          </pre>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
            Key not found
          </p>
        )}
      </div>
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
          <label className="mb-1 block text-sm font-medium text-foreground dark:text-foreground-night">
            Resource Type
          </label>
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
                <label className="mb-1 block text-sm font-medium text-foreground dark:text-foreground-night">
                  {param.label}
                </label>
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
                <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                  Computed Key
                </label>
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
          <label className="mb-1 block text-sm font-medium text-foreground dark:text-foreground-night">
            Redis Key
          </label>
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
