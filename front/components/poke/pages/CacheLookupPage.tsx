import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import {
  PokeSelect,
  PokeSelectContent,
  PokeSelectItem,
  PokeSelectTrigger,
  PokeSelectValue,
} from "@app/components/poke/shadcn/ui/select";
import { CACHE_REGISTRY } from "@app/lib/poke/cache_registry";
import { usePokeCacheLookup } from "@app/poke/swr/cache";
import { Button, Chip, Input, Spinner } from "@dust-tt/sparkle";
import { useState } from "react";

type LookupMode = "structured" | "raw";

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

export function CacheLookupPage() {
  useSetPokePageTitle("Cache Lookup");

  const [mode, setMode] = useState<LookupMode>("structured");
  const [selectedType, setSelectedType] = useState<string>("");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [rawKey, setRawKey] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const entry = selectedType ? CACHE_REGISTRY[selectedType] : null;

  const allParamsFilled = entry
    ? entry.params.every((p) => paramValues[p.name]?.trim())
    : false;

  const canLookup =
    mode === "raw" ? rawKey.trim().length > 0 : selectedType && allParamsFilled;

  const { data, isCacheLoading, isCacheError } = usePokeCacheLookup({
    type: mode === "structured" ? selectedType : undefined,
    params: mode === "structured" ? paramValues : undefined,
    rawKey: mode === "raw" ? rawKey.trim() : undefined,
    disabled: !submitted || !canLookup,
  });

  function handleTypeChange(value: string) {
    setSelectedType(value);
    setParamValues({});
    setSubmitted(false);
  }

  function handleParamChange(name: string, value: string) {
    setParamValues((prev) => ({ ...prev, [name]: value }));
    setSubmitted(false);
  }

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
            {/* Mode toggle */}
            <div className="flex gap-2">
              <Chip
                color={mode === "structured" ? "blue" : "primary"}
                onClick={() => {
                  setMode("structured");
                  setSubmitted(false);
                }}
              >
                Structured
              </Chip>
              <Chip
                color={mode === "raw" ? "blue" : "primary"}
                onClick={() => {
                  setMode("raw");
                  setSubmitted(false);
                }}
              >
                Raw Key
              </Chip>
            </div>

            {mode === "structured" ? (
              <>
                {/* Cache type selector */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Cache Type
                  </label>
                  <PokeSelect
                    value={selectedType}
                    onValueChange={handleTypeChange}
                  >
                    <PokeSelectTrigger>
                      <PokeSelectValue placeholder="Select a cache type..." />
                    </PokeSelectTrigger>
                    <PokeSelectContent>
                      {Object.entries(CACHE_REGISTRY).map(([key, e]) => (
                        <PokeSelectItem key={key} value={key}>
                          {e.label}
                        </PokeSelectItem>
                      ))}
                    </PokeSelectContent>
                  </PokeSelect>
                  {entry && (
                    <p className="mt-1 text-xs text-gray-500">
                      {entry.description}
                    </p>
                  )}
                </div>

                {/* Dynamic parameter fields */}
                {entry &&
                  entry.params.map((param) => (
                    <div key={param.name}>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {param.label}
                        <span className="ml-1 text-xs text-gray-400">
                          ({param.type})
                        </span>
                      </label>
                      <Input
                        placeholder={param.label}
                        value={paramValues[param.name] ?? ""}
                        onChange={(e) =>
                          handleParamChange(param.name, e.target.value)
                        }
                        onKeyDown={handleKeyDown}
                        name={param.name}
                      />
                    </div>
                  ))}
              </>
            ) : (
              /* Raw key input */
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
            )}

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
