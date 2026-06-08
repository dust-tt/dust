import { createPlugin } from "@app/lib/api/poke/types";
import { updateWorkspaceMetadata } from "@app/lib/api/workspace";
import { Err, Ok } from "@app/types/shared/result";

export const setWebProvidersPlugin = createPlugin({
  manifest: {
    id: "set-web-providers",
    name: "Set Web Search & Browse Providers",
    description:
      "Set the default web search and browse providers for a workspace.",
    resourceTypes: ["workspaces"],
    args: {
      webSearchProvider: {
        type: "enum",
        label: "Web Search Provider",
        description: "Default provider for web search",
        values: [
          { label: "Firecrawl", value: "firecrawl" },
          { label: "Exa", value: "exa" },
        ],
        multiple: false,
      },
      webBrowseProvider: {
        type: "enum",
        label: "Web Browse Provider",
        description: "Default provider for web browsing",
        values: [
          { label: "Firecrawl", value: "firecrawl" },
          { label: "Spider", value: "spider" },
          { label: "Exa", value: "exa" },
        ],
        multiple: false,
      },
    },
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const webSearchProvider = args.webSearchProvider[0];
    const webBrowseProvider = args.webBrowseProvider[0];

    if (webSearchProvider !== "exa" && webSearchProvider !== "firecrawl") {
      return new Err(new Error("Invalid or missing webSearchProvider value."));
    }
    if (
      webBrowseProvider !== "exa" &&
      webBrowseProvider !== "firecrawl" &&
      webBrowseProvider !== "spider"
    ) {
      return new Err(new Error("Invalid or missing webBrowseProvider value."));
    }

    const result = await updateWorkspaceMetadata(workspace, {
      webSearchProvider,
      webBrowseProvider,
    });

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok({
      display: "text",
      value: `Providers updated: search=${webSearchProvider}, browse=${webBrowseProvider}`,
    });
  },
});
