import type {
  GitHubIssueNode,
  GitHubPullRequestNode,
} from "@app/lib/providers/github/types";

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
      content += `### @${comment.author.login} (${comment.createdAt})\n\n`;
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
      content += `### @${review.author.login} - ${review.state} (${review.createdAt})\n\n`;
      if (review.body) {
        content += `${review.body}\n\n`;
      }
    }
  }

  return content;
}
