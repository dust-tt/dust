type Logger = {
  warning(message: string): void;
};

export function escapeSlackText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * @cc [label:security] slack-mention-resolution
 * A GitHub handle may only become a Slack mention through its `.authors` email and a Slack
 * lookup returning a well-formed user id. Handles that fail either step MUST stay plain text.
 */
export async function resolveSlackMentions({
  handles,
  authors,
  slackToken,
  core,
}: {
  handles: Iterable<string>;
  authors: string;
  slackToken: string;
  core: Logger;
}): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  for (const line of authors.split(/\r?\n/)) {
    const entry = /^([^:]+):\s*(\S+)\s*$/.exec(line);
    if (entry) {
      emails.set(entry[1].toLowerCase(), entry[2]);
    }
  }

  const mentions = new Map<string, string>();
  await Promise.all(
    [...new Set([...handles].map((handle) => handle.toLowerCase()))].map(
      async (handle) => {
        const email = emails.get(handle);
        if (!email) {
          core.warning(`No .authors email found for @${handle}.`);
          return;
        }

        let data: unknown;
        try {
          const response = await fetch(
            "https://slack.com/api/users.lookupByEmail",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${slackToken}` },
              body: new URLSearchParams({ email }),
            }
          );
          if (!response.ok) {
            core.warning(
              `Slack user lookup failed for @${handle}: HTTP ${response.status}.`
            );
            return;
          }
          data = await response.json();
        } catch {
          core.warning(`Slack user lookup failed for @${handle}.`);
          return;
        }
        if (
          typeof data === "object" &&
          data !== null &&
          "ok" in data &&
          data.ok === true &&
          "user" in data &&
          typeof data.user === "object" &&
          data.user !== null &&
          "id" in data.user &&
          typeof data.user.id === "string" &&
          /^[UW][A-Z0-9]+$/.test(data.user.id)
        ) {
          mentions.set(handle, `<@${data.user.id}>`);
        } else {
          core.warning(`No Slack user found for @${handle}.`);
        }
      }
    )
  );
  return mentions;
}
