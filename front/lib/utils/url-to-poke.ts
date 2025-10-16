/**
 * Converts Dust webapp URLs to their poke equivalents
 * Returns null if no poke equivalent exists
 */

interface RouteMapping {
  pattern: RegExp;
  pokePath: string | null;
}

const ROUTE_MAPPINGS: RouteMapping[] = [
  // Conversations (old /assistant/, /agent/, and new /conversation/ URLs)
  {
    pattern: /^\/w\/([^/]+)\/assistant\/([^/]+)$/,
    pokePath: "/poke/$1/conversation/$2",
  },
  {
    pattern: /^\/w\/([^/]+)\/agent\/([^/]+)$/,
    pokePath: "/poke/$1/conversation/$2",
  },
  {
    pattern: /^\/w\/([^/]+)\/conversation\/([^/]+)$/,
    pokePath: "/poke/$1/conversation/$2",
  },

  // Assistants
  {
    pattern: /^\/w\/([^/]+)\/builder\/assistants\/([^/]+)$/,
    pokePath: "/poke/$1/assistants/$2",
  },

  // Spaces
  {
    pattern: /^\/w\/([^/]+)\/spaces\/([^/]+)$/,
    pokePath: "/poke/$1/spaces/$2",
  },

  // Apps
  {
    pattern: /^\/w\/([^/]+)\/spaces\/([^/]+)\/apps\/([^/]+)$/,
    pokePath: "/poke/$1/spaces/$2/apps/$3",
  },

  // App runs
  {
    pattern: /^\/w\/([^/]+)\/spaces\/([^/]+)\/apps\/([^/]+)\/runs$/,
    pokePath: "/poke/$1/spaces/$2/apps/$3",
  },

  // Specific app run
  {
    pattern: /^\/w\/([^/]+)\/spaces\/([^/]+)\/apps\/([^/]+)\/runs\/([^/]+)$/,
    pokePath: "/poke/$1/spaces/$2/apps/$3",
  },

  // Data source views in spaces/categories
  {
    pattern:
      /^\/w\/([^/]+)\/spaces\/([^/]+)\/categories\/[^/]+\/data_source_views\/([^/]+)$/,
    pokePath: "/poke/$1/spaces/$2/data_source_views/$3",
  },

  // MCP server views
  {
    pattern: /^\/w\/([^/]+)\/spaces\/([^/]+)\/mcp_server_views\/([^/]+)$/,
    pokePath: "/poke/$1/spaces/$2/mcp_server_views/$3",
  },

  // Workspace root
  {
    pattern: /^\/w\/([^/]+)$/,
    pokePath: "/poke/$1",
  },

  // Workspace/memberships
  {
    pattern: /^\/w\/([^/]+)\/workspace$/,
    pokePath: "/poke/$1",
  },

  // Members
  {
    pattern: /^\/w\/([^/]+)\/members$/,
    pokePath: "/poke/$1/memberships",
  },

  // Trackers (labs)
  {
    pattern: /^\/w\/([^/]+)\/labs\/trackers\/([^/]+)$/,
    pokePath: "/poke/$1/trackers/$2",
  },

  // Data sources (legacy)
  {
    pattern: /^\/w\/([^/]+)\/data_sources\/([^/]+)$/,
    pokePath: "/poke/$1/data_sources/$2",
  },

  // Routes without poke equivalents
  {
    pattern: /^\/w\/([^/]+)\/join$/,
    pokePath: null,
  },
  {
    pattern: /^\/w\/([^/]+)\/subscription$/,
    pokePath: null,
  },
  {
    pattern: /^\/w\/([^/]+)\/oauth\//,
    pokePath: null,
  },
  {
    pattern: /^\/w\/([^/]+)\/builder\/data_sources/,
    pokePath: null,
  },
  {
    pattern: /^\/w\/([^/]+)\/spaces\/([^/]+)\/categories\//,
    pokePath: null,
  },
  {
    pattern:
      /^\/w\/([^/]+)\/spaces\/([^/]+)\/apps\/([^/]+)\/(settings|specification|datasets)/,
    pokePath: null,
  },
  {
    pattern: /^\/w\/([^/]+)\/labs\/(transcripts|mcp_actions)/,
    pokePath: null,
  },
];

export function convertUrlToPoke(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // Check if it's a Dust domain (dust.tt or any subdomain like eu.dust.tt)
    // Must be exactly dust.tt or *.dust.tt (not *dust.tt which would match notdust.tt)
    if (
      urlObj.hostname !== "dust.tt" &&
      !urlObj.hostname.endsWith(".dust.tt")
    ) {
      return null;
    }

    const pathname = urlObj.pathname;

    // Find matching route
    for (const mapping of ROUTE_MAPPINGS) {
      const match = pathname.match(mapping.pattern);
      if (match) {
        if (mapping.pokePath === null) {
          return null;
        }

        // Replace placeholders with captured groups
        let pokePath = mapping.pokePath;
        for (let i = 1; i < match.length; i++) {
          pokePath = pokePath.replace(`$${i}`, match[i]);
        }

        // Construct new URL with poke path
        const pokeUrl = new URL(urlObj);
        pokeUrl.pathname = pokePath;

        // Remove query params that might not be relevant in poke
        pokeUrl.search = "";

        return pokeUrl.toString();
      }
    }

    // No match found
    return null;
  } catch (error) {
    // Invalid URL
    return null;
  }
}

export function convertPokeToUrl(pokeUrl: string): string | null {
  try {
    const urlObj = new URL(pokeUrl);

    // Check if it's a Dust domain (dust.tt or any subdomain like eu.dust.tt)
    // Must be exactly dust.tt or *.dust.tt (not *dust.tt which would match notdust.tt)
    if (
      urlObj.hostname !== "dust.tt" &&
      !urlObj.hostname.endsWith(".dust.tt")
    ) {
      return null;
    }

    const pathname = urlObj.pathname;

    // Check if it's a poke URL
    if (!pathname.startsWith("/poke/")) {
      return null;
    }

    // Remove /poke/ prefix
    const pokePath = pathname.slice(6);

    // Define reverse mappings
    const reverseMappings: Array<[RegExp, string]> = [
      [/^([^/]+)\/conversation\/([^/]+)$/, "/w/$1/conversation/$2"],
      [/^([^/]+)\/agents\/([^/]+)$/, "/w/$1/builder/agents/$2"],
      [/^([^/]+)\/spaces\/([^/]+)\/apps\/([^/]+)$/, "/w/$1/spaces/$2/apps/$3"],
      [
        /^([^/]+)\/spaces\/([^/]+)\/data_source_views\/([^/]+)$/,
        "/w/$1/spaces/$2/categories/data/data_source_views/$3",
      ],
      [
        /^([^/]+)\/spaces\/([^/]+)\/mcp_server_views\/([^/]+)$/,
        "/w/$1/spaces/$2/mcp_server_views/$3",
      ],
      [/^([^/]+)\/spaces\/([^/]+)$/, "/w/$1/spaces/$2"],
      [/^([^/]+)\/memberships$/, "/w/$1/members"],
      [/^([^/]+)\/trackers\/([^/]+)$/, "/w/$1/labs/trackers/$2"],
      [/^([^/]+)\/data_sources\/([^/]+)$/, "/w/$1/data_sources/$2"],
      [/^([^/]+)$/, "/w/$1"],
    ];

    for (const [pattern, replacement] of reverseMappings) {
      const match = pokePath.match(pattern);
      if (match) {
        let webPath = replacement;
        for (let i = 1; i < match.length; i++) {
          webPath = webPath.replace(`$${i}`, match[i]);
        }

        const webUrl = new URL(urlObj);
        webUrl.pathname = webPath;
        return webUrl.toString();
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}
