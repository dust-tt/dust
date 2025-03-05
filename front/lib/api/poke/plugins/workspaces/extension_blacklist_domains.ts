import { Err, Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { updateExtensionConfiguration } from "@app/lib/api/workspace";
import { isDomain } from "@app/lib/utils";

export const extensionBlacklistDomainsPlugin = createPlugin({
  manifest: {
    id: "extension-blacklist-domains",
    name: "Extension Blacklist Domains/URLs",
    description:
      "Update the list of blacklisted domains/URLs for the extension",
    resourceTypes: ["workspaces"],
    args: {
      domains: {
        type: "string",
        label: "Blacklisted domains/URLs",
        description:
          "Comma-separated list of domains or URLs to blacklist for the extension. This will override the existing list (if any).",
      },
    },
  },
  execute: async (auth, _, args) => {
    const domains = args.domains
      ? args.domains
          .split(",")
          .map((d) => d.trim())
          .filter((d) => d)
      : [];

    if (!areDomainsValid(domains)) {
      return new Err(
        new Error(
          "One or more domains or URLs are invalid. Please check the values format."
        )
      );
    }

    const res = await updateExtensionConfiguration(auth, domains);
    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value: `Blacklisted domains/URLs updated.`,
    });
  },
});

function areDomainsValid(domains: string[]): boolean {
  if (domains.length === 0) {
    return true; // Empty domains array is valid
  }

  return domains.every((domain) => {
    if (domain.startsWith("http://") || domain.startsWith("https://")) {
      try {
        new URL(`http://${domain}`);
      } catch (_) {
        return false;
      }

      return true;
    }

    if (domain.length > 253) {
      return false;
    }
    if (!isDomain(domain)) {
      return false;
    }
    const labels = domain.split(".");
    if (labels.some((label) => label.length > 63)) {
      return false;
    }

    return true;
  });
}
