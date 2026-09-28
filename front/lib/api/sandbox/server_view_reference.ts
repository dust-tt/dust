import type { MCPServerViewType } from "@app/lib/api/mcp";

/**
 * @cc [owner:davidebbo,label:product;api] server-reference-resolution
 * A sandbox tool call names its server with a single reference string, resolved against the
 * views the caller can see. The views returned MUST be those of the first rule that matches at
 * least one view, and none from a later rule:
 *
 * 1. the view `sId`;
 * 2. the view's own `name` (the admin-set name, e.g. `gmail2`), which is how the agent loop tells
 *    two instances of one server apart;
 * 3. the server's `name` (e.g. `gmail`), shared by every instance of that server.
 *
 * Every view matching the winning rule MUST be returned, never only the first: the caller turns more
 * than one match into an ambiguity error rather than picking a view on its own. A reference
 * matching nothing returns an empty list.
 */
export function selectServerViewsByReference(
  views: MCPServerViewType[],
  reference: string
): MCPServerViewType[] {
  const rules: ((view: MCPServerViewType) => boolean)[] = [
    (view) => view.sId === reference,
    (view) => view.name === reference,
    (view) => view.server.name === reference,
  ];

  for (const rule of rules) {
    const matches = views.filter(rule);
    if (matches.length > 0) {
      return matches;
    }
  }

  return [];
}
