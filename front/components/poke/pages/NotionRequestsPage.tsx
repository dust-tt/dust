import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeDataSourceDetails } from "@app/poke/swr/data_source_details";
import {
  Button,
  Input,
  LinkWrapper,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";
import { useState } from "react";

type HttpMethod = "GET" | "POST";

export function NotionRequestsPage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - Notion Requests`);

  const dsId = useRequiredPathParam("dsId");
  const { isDark } = useTheme();
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [body, setBody] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<{
    status: number;
    data: unknown;
  } | null>(null);

  const {
    data: dataSourceDetails,
    isLoading,
    isError,
  } = usePokeDataSourceDetails({
    owner,
    dsId,
    disabled: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !dataSourceDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading data source details.</p>
      </div>
    );
  }

  const { dataSource } = dataSourceDetails;

  // Only allow for Notion datasources
  if (dataSource.connectorProvider !== "notion") {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>This page is only available for Notion data sources.</p>
      </div>
    );
  }

  const handleExecuteRequest = async () => {
    if (!url.trim()) {
      setError("Please enter a URL");
      return;
    }

    // Validate body for POST requests
    if (method === "POST" && body.trim()) {
      try {
        JSON.parse(body);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
      } catch (e) {
        setError("Invalid JSON in request body");
        return;
      }
    }

    setIsExecuting(true);
    setError(null);
    setResponse(null);

    try {
      const res = await clientFetch(`/api/poke/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          majorCommand: "notion",
          command: "api-request",
          args: {
            wId: owner.sId,
            dsId: dataSource.sId,
            url,
            method,
            body: method === "POST" && body.trim() ? body : undefined,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          errorData.error?.connectors_error?.message ||
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            errorData.error?.message ||
            "Failed to execute request"
        );
      }

      const result = await res.json();
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="max-w-6xl">
      <h3 className="text-xl font-bold">
        Notion API Requests for {dataSource.name} in workspace{" "}
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
      </h3>

      <div className="mt-2 text-sm text-gray-600">
        Make HTTP requests to the Notion API using the stored token. The
        Notion-Version header (2022-06-28) and authentication are automatically
        included.
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {/* Request Configuration */}
        <div className="border-material-200 rounded-lg border p-4">
          <h4 className="mb-3 text-lg font-semibold">Request</h4>

          {/* Method Selector */}
          <div className="mb-4 flex items-center gap-3">
            <label className="w-20 text-sm font-medium">Method:</label>
            <div className="flex gap-2">
              <Button
                variant={method === "GET" ? "primary" : "outline"}
                label="GET"
                size="sm"
                onClick={() => {
                  setMethod("GET");
                  setBody("");
                }}
              />
              <Button
                variant={method === "POST" ? "primary" : "outline"}
                label="POST"
                size="sm"
                onClick={() => setMethod("POST")}
              />
            </div>
          </div>

          {/* URL Input */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium">
              URL (relative to https://api.notion.com/v1/):
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g., search, users/me, databases/{database_id}/query"
              name="url"
            />
            <div className="mt-1 text-xs text-gray-500">
              Enter the path without the base URL. Example: "search" for
              https://api.notion.com/v1/search
            </div>
          </div>

          {/* Body Input (only for POST) */}
          {method === "POST" && (
            <div>
              <label className="mb-2 block text-sm font-medium">
                Request Body (JSON):
              </label>
              <TextArea
                value={body}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setBody(e.target.value)
                }
                placeholder='{"query": "test"}'
                className="min-h-32 w-full font-mono text-sm"
              />
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="primary"
              onClick={handleExecuteRequest}
              disabled={isExecuting}
              label={isExecuting ? "Executing..." : "Execute Request"}
              icon={isExecuting ? Spinner : undefined}
            />
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">Error</p>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Response Display */}
        {response && (
          <div className="border-material-200 rounded-lg border p-4">
            <h4 className="mb-3 text-lg font-semibold">Response</h4>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <span
                className={`rounded px-2 py-1 text-sm font-semibold ${
                  response.status >= 200 && response.status < 300
                    ? "bg-green-100 text-green-800"
                    : response.status >= 400
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {response.status}
              </span>
            </div>
            <div className="rounded-md bg-gray-50 p-4">
              <JsonViewer
                theme={isDark ? "dark" : "light"}
                value={response.data}
                rootName={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
