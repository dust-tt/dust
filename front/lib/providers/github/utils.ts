import type {
  GitHubIssueNode,
  GitHubPullRequestNode,
} from "@app/lib/providers/github/types";
import { dateToHumanReadable } from "@app/types/shared/utils/date_utils";

const GITHUB_MAX_SEARCH_QUERY_LENGTH = 256;
const GITHUB_MAX_BOOLEAN_OPERATORS = 5;
const GITHUB_BOOLEAN_OPERATORS = "(?:AND|OR|NOT)";

/**
 * Truncates a GitHub search query to respect both the 256 character limit
 * and the maximum of 5 AND/OR/NOT operators.
 * https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#limitations-on-query-length
 */
export function truncateGitHubQuery(query: string): string {
  // First, check boolean operator count
  const operatorRegex = new RegExp(`\\b${GITHUB_BOOLEAN_OPERATORS}\\b`, "gi");
  const operators = query.match(operatorRegex) ?? [];

  let truncated = query;

  // If too many operators, truncate by removing complete clauses from the end
  if (operators.length > GITHUB_MAX_BOOLEAN_OPERATORS) {
    // Split by operators while keeping them
    const parts = query.split(
      new RegExp(`(\\s+${GITHUB_BOOLEAN_OPERATORS}\\s+)`, "gi")
    );

    let operatorCount = 0;
    let validLength = 0;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isOperator = new RegExp(
        `^\\s*${GITHUB_BOOLEAN_OPERATORS}\\s*$`,
        "i"
      ).test(part);

      if (isOperator) {
        operatorCount++;
        if (operatorCount > GITHUB_MAX_BOOLEAN_OPERATORS) {
          break;
        }
      }

      validLength += part.length;
    }

    truncated = query.slice(0, validLength).trim();
  }

  // Then, check character limit and truncate at word boundary if needed
  if (truncated.length > GITHUB_MAX_SEARCH_QUERY_LENGTH) {
    truncated = truncated.slice(0, GITHUB_MAX_SEARCH_QUERY_LENGTH);
    // Truncate at last complete word to avoid cutting mid-word
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > 0) {
      truncated = truncated.slice(0, lastSpace);
    }
  }

  return truncated.trim();
}

export function buildContentSummaryForIssue(node: GitHubIssueNode): string {
  const owner = node.repository.owner.login;
  const repo = node.repository.name;
  const number = node.number;

  let content = `# Issue #${number}: ${node.title}\n\n`;
  content += `**Repository:** ${owner}/${repo}\n`;
  content += `**Author:** @${node.author.login}\n`;
  content += `**State:** ${node.state}\n`;
  content += `**URL:** ${node.url}\n\n`;

  if (node.body) {
    content += `## Issue Description\n\n${node.body}\n\n`;
  }
  content += `---\n\n`;

  if (node.comments.nodes.length > 0) {
    content += `## Comments (${node.comments.nodes.length})\n\n`;
    for (const comment of node.comments.nodes) {
      const commentDate = dateToHumanReadable(new Date(comment.createdAt));
      content += `**@${comment.author.login}** — ${commentDate}\n\n`;
      content += `> ${comment.body.split("\n").join("\n> ")}\n\n`;
    }
  }

  return content;
}

export function buildContentSummaryForPullRequest(
  node: GitHubPullRequestNode
): string {
  const owner = node.repository.owner.login;
  const repo = node.repository.name;
  const number = node.number;

  let content = `# Pull Request #${number}: ${node.title}\n\n`;
  content += `**Repository:** ${owner}/${repo}\n`;
  content += `**Author:** @${node.author.login}\n`;
  content += `**State:** ${node.state}\n`;
  content += `**URL:** ${node.url}\n\n`;

  if (node.body) {
    content += `## PR Description\n\n${node.body}\n\n`;
  }

  content += `---\n\n`;

  // General comments section
  if (node.comments.nodes.length > 0) {
    content += `## General Comments\n\n`;
    for (const comment of node.comments.nodes) {
      const commentDate = dateToHumanReadable(new Date(comment.createdAt));
      content += `**@${comment.author.login}** — ${commentDate}\n\n`;
      content += `> ${comment.body.split("\n").join("\n> ")}\n\n`;
    }
    content += `---\n\n`;
  }

  // Reviews and threaded comments
  if (node.reviews.nodes.length > 0) {
    content += `## Reviews\n\n`;

    for (const review of node.reviews.nodes) {
      const reviewDate = dateToHumanReadable(new Date(review.createdAt));
      content += `### Review Summary\n`;
      content += `- Review decision: ${review.state}\n`;
      content += `- Reviewer: @${review.author.login}\n`;
      content += `- Submitted at: ${reviewDate}\n\n`;

      if (review.body) {
        content += `Summary body:\n`;
        content += `> ${review.body.split("\n").join("\n> ")}\n\n`;
      }

      // Process review comments
      if (review.comments.nodes.length > 0) {
        content += `**Review Comments:**\n\n`;

        let messageNumber = 1;
        for (const comment of review.comments.nodes) {
          const commentDate = dateToHumanReadable(new Date(comment.createdAt));
          content += `${messageNumber}) **@${comment.author.login}** — ${commentDate}\n`;
          content += `   > ${comment.body.split("\n").join("\n   > ")}\n\n`;
          messageNumber++;
        }
      }

      content += `---\n\n`;
    }
  }

  return content;
}
