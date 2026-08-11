import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ExportResult } from "@app/lib/api/actions/servers/shopify/types";
import { PageInfoSchema } from "@app/lib/api/actions/servers/shopify/types";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

const SHOPIFY_API_VERSION = "2026-07";

// Shopify caps a connection's `first` argument at 250.
const PAGE_SIZE = 250;

// Hard cap on exported records to keep responses and API usage bounded.
export const MAX_EXPORT_ITEMS = 1000;

async function shopifyGraphQL<T extends z.ZodTypeAny>(
  {
    accessToken,
    shop,
    query,
  }: {
    accessToken: string;
    shop: string;
    query: string;
  },
  schema: T
): Promise<Result<z.infer<T>, MCPError>> {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  let response: Awaited<ReturnType<typeof untrustedFetch>>;
  try {
    response = await untrustedFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query }),
    });
  } catch (err) {
    return new Err(
      new MCPError(
        `Failed to reach the Shopify API: ${normalizeError(err).message}`
      )
    );
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      return new Err(
        new MCPError(
          "Shopify authentication failed. The access token may be expired or missing the required scope."
        )
      );
    }
    return new Err(
      new MCPError(
        `Shopify API error: ${response.status} ${response.statusText} - ${body.slice(0, 200)}`
      )
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(await response.text());
  } catch (err) {
    return new Err(
      new MCPError(
        `Invalid JSON from the Shopify API: ${normalizeError(err).message}`
      )
    );
  }

  // Shopify returns HTTP 200 with partial `data` and an `errors` array when a
  // field is redacted (e.g. missing scope / PCD). `data` is validated inline by
  // the tool schema; `nullish` keeps the "data absent + errors" case parseable
  // so we can surface the GraphQL error rather than a format error.
  const parsed = z
    .object({
      data: schema.nullish(),
      errors: z.array(z.object({ message: z.string() })).optional(),
    })
    .safeParse(json);
  if (!parsed.success) {
    logger.error(
      { error: parsed.error.message },
      "[Shopify MCP Server] Response validation failed"
    );
    return new Err(
      new MCPError(`Invalid Shopify response format: ${parsed.error.message}`)
    );
  }

  const { data, errors } = parsed.data;

  // Only fail when `data` is absent; otherwise use what we got and log the
  // redactions.
  if (data === undefined || data === null) {
    const message =
      errors?.map((e) => e.message).join("; ") ?? "Shopify returned no data.";
    return new Err(new MCPError(`Shopify GraphQL error: ${message}`));
  }
  if (errors && errors.length > 0) {
    logger.warn(
      { errors: errors.map((e) => e.message) },
      "[Shopify MCP Server] Partial response with errors (likely redacted fields)"
    );
  }

  return new Ok(data);
}

// One page of a Shopify connection, flattened to the shape `paginate` consumes.
interface Page<N> {
  nodes: N[];
  hasNextPage: boolean;
  endCursor: string | null;
}

async function paginate<N>({
  limit,
  runPage,
}: {
  limit: number;
  runPage: (cursor: string | null) => Promise<Result<Page<N>, MCPError>>;
}): Promise<Result<ExportResult<N>, MCPError>> {
  const cap = Math.min(limit, MAX_EXPORT_ITEMS);
  const nodes: N[] = [];
  let cursor: string | null = null;

  while (nodes.length < cap) {
    const pageRes = await runPage(cursor);
    if (pageRes.isErr()) {
      return pageRes;
    }
    const page = pageRes.value;
    nodes.push(...page.nodes);
    if (!page.hasNextPage || !page.endCursor) {
      return new Ok({ nodes: nodes.slice(0, cap), truncated: false });
    }
    cursor = page.endCursor;
  }

  return new Ok({ nodes: nodes.slice(0, cap), truncated: true });
}

// Wrap a value in single quotes for the Shopify search syntax so values with
// spaces are matched as a whole. Escape backslashes before quotes so the
// ordering does not double-escape.
export function quoteSearchValue(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

// A Shopify connection response, aliased to a fixed `connection` key so a single
// generic helper can extract it type-safely regardless of the root field.
function connectionSchema<T extends z.ZodTypeAny>(node: T) {
  return z.object({
    connection: z.object({
      edges: z.array(z.object({ node })),
      pageInfo: PageInfoSchema,
    }),
  });
}

// Paginate any Shopify connection: build the query from `root` + `fields`,
// validate each page against `nodeSchema`, and accumulate via `paginate`.
export async function paginateConnection<T extends z.ZodTypeAny>({
  accessToken,
  shop,
  root,
  fields,
  filters,
  limit,
  nodeSchema,
}: {
  accessToken: string;
  shop: string;
  root: "products" | "customers" | "orders";
  fields: string;
  filters: string[];
  limit: number;
  nodeSchema: T;
}): Promise<Result<ExportResult<z.infer<T>>, MCPError>> {
  const schema = connectionSchema(nodeSchema);
  return paginate<z.infer<T>>({
    limit,
    runPage: async (cursor) => {
      const after = cursor ? `, after: ${JSON.stringify(cursor)}` : "";
      const search = filters.length
        ? `, query: ${JSON.stringify(filters.join(" "))}`
        : "";
      const query = `{
        connection: ${root}(first: ${PAGE_SIZE}${after}${search}) {
          edges { node { ${fields} } }
          pageInfo { hasNextPage endCursor }
        }
      }`;
      const res = await shopifyGraphQL({ accessToken, shop, query }, schema);
      if (res.isErr()) {
        return res;
      }
      const { edges, pageInfo } = res.value.connection;
      return new Ok({
        nodes: edges.map((e) => e.node),
        hasNextPage: pageInfo.hasNextPage,
        endCursor: pageInfo.endCursor,
      });
    },
  });
}
