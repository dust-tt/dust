import { escapeSlackText } from "../lib/slack.ts";

export type PullRequestSummary = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  user: { login: string; avatar_url: string };
  head: { ref: string };
  base: { ref: string; repo: { full_name: string } };
  labels: { name?: string }[];
  additions: number;
  deletions: number;
  changed_files: number;
  comments: number;
  review_comments: number;
  created_at: string;
};

type SlackAttachment = {
  color: string;
  blocks: Record<string, unknown>[];
};

const GITHUB_ICON_URL = "https://github.githubassets.com/favicons/favicon.png";
const EXCERPT_MAX_CHARS = 500;
const EXCERPT_MAX_LINES = 8;
const DIFFSTAT_SQUARES = 5;

// GitHub's Primer state colors.
const STATES = {
  draft: { label: "Draft", color: "#59636e" },
  open: { label: "Open", color: "#1f883d" },
  merged: { label: "Merged", color: "#8250df" },
  closed: { label: "Closed", color: "#cf222e" },
};

function getState(pr: PullRequestSummary) {
  if (pr.merged) {
    return STATES.merged;
  }
  if (pr.state === "closed") {
    return STATES.closed;
  }
  return pr.draft ? STATES.draft : STATES.open;
}

/**
 * Converts the start of a GitHub Markdown PR description to Slack mrkdwn. Only the `Description`
 * section of the PR template is kept when present.
 */
/**
 * @cc [label:security] pr-excerpt-escaping
 * The excerpt MUST NOT contain Slack control sequences coming from the PR body: `&`, `<` and `>`
 * are escaped, and the only links produced are `<http(s)://...|text>` links from Markdown links
 * whose target starts with `http://` or `https://`. Mentions, channel pings, and other link
 * targets stay escaped text.
 */
export function formatPullRequestExcerpt(body: string | null): string {
  let text = (body ?? "")
    .replace(/\r/g, "")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "");

  const description =
    /^#{1,3}[ \t]+Description[ \t]*\n([\s\S]*?)(?=^#{1,3}[ \t]|(?![\s\S]))/im.exec(
      text
    );
  if (description) {
    text = description[1];
  }

  text = text
    // Code blocks and images do not render well in a short preview.
    .replace(
      /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[ \t]*$|(?![\s\S]))/gm,
      ""
    )
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<\/?[a-z][^>]*>/gi, "");

  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    // Review requests already appear in the notification text.
    if (/^r\?[ \t]/.test(rawLine)) {
      continue;
    }
    let line = escapeSlackText(rawLine.trimEnd());
    const heading = /^ {0,3}#{1,6}[ \t]+(.*?)[ \t#]*$/.exec(line);
    if (heading) {
      line = heading[1] ? `\u0001${heading[1]}\u0001` : "";
    } else {
      line = line
        .replace(
          /^(\s*)[-*+][ \t]+\[[ xX]\][ \t]+/,
          (_m, indent: string) => `${indent}• `
        )
        .replace(/^(\s*)[-*+][ \t]+/, "$1• ");
    }
    lines.push(formatInline(line));
  }

  const formatted = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return truncate(formatted);
}

function formatInline(line: string): string {
  const links: string[] = [];
  // Placeholders keep link targets out of the emphasis rewrites below.
  const placeholder = (link: string) => {
    links.push(link);
    return `\u0000${links.length - 1}\u0000`;
  };
  return line
    .replace(/`([^`]+)`/g, (_m, code: string) => placeholder(`\`${code}\``))
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_m, label: string, url: string) =>
        placeholder(`<${url}|${label.replaceAll("|", "¦")}>`)
    )
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "\u0001$2\u0001")
    .replace(/(?<![\w*])\*(?=\S)([^*]+?)(?<=\S)\*(?![\w*])/g, "_$1_")
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "~$1~")
    .replace(/\u0001/g, "*")
    .replace(/\u0000(\d+)\u0000/g, (_m, index: string) => links[Number(index)]);
}

function truncate(text: string): string {
  const lines = text.split("\n");
  let result = lines.slice(0, EXCERPT_MAX_LINES).join("\n");
  let truncated = lines.length > EXCERPT_MAX_LINES;
  if (result.length > EXCERPT_MAX_CHARS) {
    result = result.slice(0, EXCERPT_MAX_CHARS);
    const cut = Math.max(result.lastIndexOf("\n"), result.lastIndexOf(" "));
    if (cut > EXCERPT_MAX_CHARS / 2) {
      result = result.slice(0, cut);
    }
    // Never leave a half-written link behind.
    const open = result.lastIndexOf("<");
    if (open > result.lastIndexOf(">")) {
      result = result.slice(0, open);
    }
    truncated = true;
  }
  return truncated ? `${result.trimEnd()}…` : result;
}

/** GitHub-style diffstat: five squares split between additions and deletions. */
export function formatDiffstat(additions: number, deletions: number): string {
  const total = additions + deletions;
  let green = 0;
  let red = 0;
  if (total > 0) {
    green = Math.round((additions / total) * DIFFSTAT_SQUARES);
    red = DIFFSTAT_SQUARES - green;
    // Keep a visible square for a side with any change.
    if (additions > 0 && green === 0) {
      green = 1;
      red -= 1;
    } else if (deletions > 0 && red === 0) {
      red = 1;
      green -= 1;
    }
  }
  return [
    ":large_green_square:".repeat(green),
    ":large_red_square:".repeat(red),
    ":white_large_square:".repeat(DIFFSTAT_SQUARES - green - red),
  ].join("");
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * @cc [label:product] pr-preview-attachment
 * Build one Slack attachment previewing the PR like GitHub's unfurl: a side bar colored by state
 * (draft, open, merged, closed), the author's login and avatar, a `#number title` link to the PR,
 * the description excerpt when non-empty, a status line with state, diff size, changed files,
 * branches, labels, and comment count when non-zero, and a `owner/repo` footer with the creation
 * date. The attachment MUST NOT contain Slack user mentions.
 */
export function formatPullRequestPreview(
  pr: PullRequestSummary
): SlackAttachment {
  const state = getState(pr);
  const excerpt = formatPullRequestExcerpt(pr.body);
  const comments = pr.comments + pr.review_comments;
  const labels = pr.labels
    .map((label) => label.name)
    .filter((name): name is string => !!name);

  const status = [
    `*${state.label}*`,
    `\`+${pr.additions.toLocaleString("en-US")}\` \`−${pr.deletions.toLocaleString("en-US")}\` ${formatDiffstat(pr.additions, pr.deletions)}`,
    plural(pr.changed_files, "file"),
    `\`${escapeSlackText(pr.head.ref)}\` → \`${escapeSlackText(pr.base.ref)}\``,
  ];
  if (comments > 0) {
    status.push(`:speech_balloon: ${comments}`);
  }
  if (labels.length > 0) {
    status.push(
      labels.map((label) => `\`${escapeSlackText(label)}\``).join(" ")
    );
  }

  const createdAt = Math.floor(Date.parse(pr.created_at) / 1000);
  const blocks: Record<string, unknown>[] = [
    {
      type: "context",
      elements: [
        {
          type: "image",
          image_url: pr.user.avatar_url,
          alt_text: pr.user.login,
        },
        { type: "mrkdwn", text: `*${escapeSlackText(pr.user.login)}*` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${escapeSlackText(pr.html_url)}|#${pr.number} ${escapeSlackText(pr.title)}>*`,
      },
    },
  ];
  if (excerpt) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: excerpt } });
  }
  blocks.push(
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: status.join("  ·  ") }],
    },
    {
      type: "context",
      elements: [
        { type: "image", image_url: GITHUB_ICON_URL, alt_text: "GitHub" },
        {
          type: "mrkdwn",
          text: Number.isFinite(createdAt)
            ? `${escapeSlackText(pr.base.repo.full_name)}  ·  <!date^${createdAt}^{date_short_pretty}|${pr.created_at.slice(0, 10)}>`
            : escapeSlackText(pr.base.repo.full_name),
        },
      ],
    }
  );
  return { color: state.color, blocks };
}
