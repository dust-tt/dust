import { Err, Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { updateExtensionConfiguration } from "@app/lib/api/workspace";

export const extensionBlacklistDomains = createPlugin(
  {
    id: "extension-blacklist-domains",
    name: "Extension Blacklist Domains",
    description: "Update the list of blacklisted domains for the extension",
    resourceTypes: ["workspaces"],
    args: {
      domains: {
        type: "string",
        label: "Blacklisted domains",
        description:
          "Comma-separated list of domains to blacklist for the extension.",
      },
    },
  },
  async (auth, resourceId, args) => {
    const domains = args.domains
      ? args.domains
          .split(",")
          .map((d) => d.trim())
          .filter((d) => d)
      : [];

    if (!areDomainsValid(domains)) {
      return new Err(
        new Error(
          "One or more domains are invalid. Please check the domain format."
        )
      );
    }

    const res = await updateExtensionConfiguration(auth, domains);
    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value: `Blacklisted domains updated.`,
    });
  }
);

function areDomainsValid(domains: string[]): boolean {
  if (domains.length === 0) {
    return true; // Empty domains array is valid
  }

  // Regular expression for domain validation
  // - Starts with alphanumeric or hyphen
  // - Can contain alphanumeric, hyphens
  // - Must have at least one dot
  // - TLD must be at least 2 characters
  // - Cannot start or end with hyphen
  // - Cannot have consecutive hyphens
  const domainRegex =
    /^(?!-)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?!-)$/;

  return domains.every((domain) => {
    if (domain.length > 253) {
      return false;
    }
    if (!domainRegex.test(domain)) {
      return false;
    }
    const labels = domain.split(".");
    if (labels.some((label) => label.length > 63)) {
      return false;
    }

    return true;
  });
}
