import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Find the project root by walking up from cwd looking for .git directory.
 */
function findProjectRoot(startDir: string): string | null {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Load DUST.md from project root if it exists.
 */
function loadDustMd(projectRoot: string | null): string | null {
  if (!projectRoot) {
    return null;
  }
  const dustMdPath = path.join(projectRoot, "DUST.md");
  if (fs.existsSync(dustMdPath)) {
    return fs.readFileSync(dustMdPath, "utf-8");
  }
  return null;
}

/**
 * Get current git status (short format).
 */
function getGitStatus(cwd: string): string {
  try {
    const status = execSync("git status --short", { cwd, encoding: "utf-8" });
    return status.trim() || "(clean)";
  } catch {
    return "(not a git repository)";
  }
}

/**
 * Get current git branch.
 */
function getGitBranch(cwd: string): string {
  try {
    return execSync("git branch --show-current", { cwd, encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Build the system prompt for the coding agent.
 */
export function buildSystemPrompt(cwd: string): string {
  const projectRoot = findProjectRoot(cwd);
  const dustMd = loadDustMd(projectRoot);
  const gitStatus = getGitStatus(cwd);
  const gitBranch = getGitBranch(cwd);
  const date = new Date().toISOString().split("T")[0];
  const platform = os.platform();

  let prompt = `You are a coding agent running in the Dust CLI. You help users with software engineering tasks by reading, writing, and editing code, running commands, and searching the codebase.

You have access to tools for file operations, command execution, and searching. Use them to assist the user.

# Environment
- Working directory: ${cwd}
- Project root: ${projectRoot ?? cwd}
- Platform: ${platform}
- Date: ${date}
- Git branch: ${gitBranch}
- Git status: ${gitStatus}

# Guidelines
- Read files before modifying them.
- Prefer editing existing files over creating new ones.
- Show diffs for file edits when the change is significant.
- Run tests after making code changes when appropriate.
- Keep responses concise and focused on the task.
- Use the glob and grep tools to search the codebase efficiently.
- For complex tasks, break them down into steps.
- You can call the call_dust_agent tool to delegate tasks to specialized Dust workspace agents.
- You can use the task tool to run sub-agents in parallel for independent work.

# Tool Usage
- Use read_file to read files before editing.
- Use edit_file for targeted text replacements (preferred over write_file for existing files).
- Use write_file only for creating new files or complete rewrites.
- Use bash for running commands, tests, and build tools.
- Use glob to find files by pattern.
- Use grep to search file contents.
- Use ask_user when you need clarification or approval.`;

  if (dustMd) {
    prompt += `

# Project Instructions (DUST.md)
${dustMd}`;
  }

  return prompt;
}
