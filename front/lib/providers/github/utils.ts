import type {
  GitHubIssueNode,
  GitHubPullRequestNode,
} from "@app/lib/providers/github/types";

const GITHUB_MAX_SEARCH_QUERY_LENGTH = 256;
const GITHUB_MAX_BOOLEAN_OPERATORS = 5;

/**
 * Truncates a GitHub search query to respect both the 256 character limit
 * and the maximum of 5 AND/OR/NOT operators.
 * https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#limitations-on-query-length
 */
export function truncateGitHubQuery(query: string): string {
  // First, check operator count
  const operatorRegex = /\b(AND|OR|NOT)\b/gi;
  const operators = query.match(operatorRegex) ?? [];

  let truncated = query;

  // If too many operators, truncate by removing complete clauses from the end
  if (operators.length > GITHUB_MAX_BOOLEAN_OPERATORS) {
    // Split by operators while keeping them
    const parts = query.split(/(\s+(?:AND|OR|NOT)\s+)/gi);

    let operatorCount = 0;
    let validLength = 0;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isOperator = /^\s*(?:AND|OR|NOT)\s*$/i.test(part);

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
    content += `## Description\n\n${node.body}\n\n`;
  }

  if (node.comments.nodes.length > 0) {
    content += `## Comments (${node.comments.nodes.length})\n\n`;
    for (const comment of node.comments.nodes) {
      content += `>> @${comment.author.login}:\n\n`;
      content += `${comment.body}\n\n`;
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
    content += `## Description\n\n${node.body}\n\n`;
  }

  if (node.comments.nodes.length > 0) {
    content += `## Comments (${node.comments.nodes.length})\n\n`;
    for (const comment of node.comments.nodes) {
      content += `>> @${comment.author.login}:\n\n`;
      content += `${comment.body}\n\n`;
    }
  }

  if (node.reviews.nodes.length > 0) {
    content += `## Reviews (${node.reviews.nodes.length})\n\n`;
    for (const review of node.reviews.nodes) {
      content += `>> @${review.author.login} - ${review.state}\n\n`;
      if (review.body) {
        content += `${review.body}\n\n`;
      }
    }
  }

  return content;
}
