import {
  addFlaggedCommits,
  getDeployedTags,
  getFlaggedCommits,
  removeFlaggedCommits,
} from "@app/lib/api/force_client_reload";
import { createPlugin } from "@app/lib/api/poke/types";
import { Ok } from "@app/types/shared/result";

export const forceClientReloadPlugin = createPlugin({
  manifest: {
    id: "force-client-reload",
    name: "Force Client Reload",
    description:
      "Force clients running specific commits to reload. " +
      "Clients sending a flagged X-Commit-Hash will receive X-Reload-Required: true.",
    resourceTypes: ["global"],
    args: {
      commits: {
        type: "enum",
        label: "Deployed image tags",
        description:
          "Select deployed image tags that should trigger a forced client reload",
        async: true,
        values: [],
        multiple: true,
      },
    },
  },
  populateAsyncArgs: async () => {
    const [flaggedCommits, deployedTags] = await Promise.all([
      getFlaggedCommits(),
      getDeployedTags(),
    ]);
    const flaggedSet = new Set(flaggedCommits);

    const commitValues = deployedTags.map((tag) => ({
      label: tag.date
        ? `[${tag.shortHash}] ${tag.date} — ${tag.title}`
        : `[${tag.shortHash}] (older deploy)`,
      value: tag.shortHash,
      checked: flaggedSet.has(tag.shortHash),
    }));

    // Include flagged commits that are no longer in the recent list.
    for (const hash of flaggedSet) {
      if (!commitValues.some((c) => c.value === hash)) {
        commitValues.push({
          label: `[${hash}] (older deploy)`,
          value: hash,
          checked: true,
        });
      }
    }

    return new Ok({ commits: commitValues });
  },
  execute: async (_auth, _resource, args) => {
    const selectedCommits = new Set(args.commits);
    const flaggedCommits = await getFlaggedCommits();
    const currentlyFlagged = new Set(flaggedCommits);

    const toAdd = args.commits.filter((c) => !currentlyFlagged.has(c));
    const toRemove = [...currentlyFlagged].filter(
      (c) => !selectedCommits.has(c)
    );

    await addFlaggedCommits(toAdd);
    await removeFlaggedCommits(toRemove);

    const actions: string[] = [];
    for (const commit of toAdd) {
      actions.push(`Added: ${commit}`);
    }
    for (const commit of toRemove) {
      actions.push(`Removed: ${commit}`);
    }

    if (actions.length === 0) {
      actions.push("No changes made.");
    }

    return new Ok({
      display: "markdown",
      value: actions.join("\n\n"),
    });
  },
});
