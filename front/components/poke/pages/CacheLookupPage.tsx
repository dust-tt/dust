import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { usePokeCacheLookup } from "@app/poke/swr/cache";
import { Button, Input, Spinner } from "@dust-tt/sparkle";
import { useState } from "react";

function formatTtl(ttlSeconds: number): string {
  if (ttlSeconds === -2) {
    return "Key does not exist";
  }
  if (ttlSeconds === -1) {
    return "No TTL (persistent)";
  }
  const minutes = Math.floor(ttlSeconds / 60);
  const seconds = ttlSeconds % 60;
  if (minutes > 0) {
    return `${minutes} min ${seconds} sec`;
  }
  return `${seconds} sec`;
}

export function CacheLookupPage() {
  useSetPokePageTitle("Cache Lookup");

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
    <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      <div className="py-12">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Redis Cache Lookup
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Inspect cached values in Redis
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-2xl">
          <div className="space-y-6 rounded-lg bg-white p-6 shadow-sm">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
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

          {/* Results */}
          {submitted && canLookup && (
            <div className="mt-6 rounded-lg bg-white p-6 shadow-sm">
              {isCacheLoading ? (
                <div className="flex justify-center">
                  <Spinner />
                </div>
              ) : isCacheError ? (
                <p className="text-sm text-red-600">
                  Error fetching cache value.
                </p>
              ) : data ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500">
                      Redis Key
                    </label>
                    <code className="mt-1 block break-all rounded bg-gray-100 p-2 text-sm">
                      {data.key}
                    </code>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500">
                      TTL
                    </label>
                    <p className="mt-1 text-sm">{formatTtl(data.ttlSeconds)}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500">
                      Value
                    </label>
                    {data.value !== null ? (
                      <pre className="mt-1 max-h-96 overflow-auto rounded bg-gray-100 p-3 text-xs">
                        {JSON.stringify(data.value, null, 2)}
                      </pre>
                    ) : (
                      <p className="mt-1 text-sm text-gray-500">
                        Key not found
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
