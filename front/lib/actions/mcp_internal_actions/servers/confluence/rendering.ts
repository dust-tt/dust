import TurndownService from "turndown";

import type {
  ConfluenceLinks,
  ConfluenceSpace,
  ConfluenceUser,
  ConfluenceV1SearchPage,
  RenderablePage,
  RenderConfluencePageOptions,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/types";

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

export function renderConfluencePage(
  page: RenderablePage,
  options: RenderConfluencePageOptions = {}
): string {
  const lines: string[] = [];
  const title = page.title?.trim() || "Untitled page";

  lines.push(`# ${title}`);

  const pageUrl = buildPageUrl(page._links);
  if (pageUrl) {
    lines.push(`URL: ${pageUrl}`);
  }

  const status = page.status?.trim();
  if (status) {
    lines.push(`Status: ${status}`);
  }

  lines.push(`Page ID: ${page.id}`);

  const spaceLine = renderSpaceLine(page);
  if (spaceLine) {
    lines.push(spaceLine);
  }

  if ("parentId" in page && page.parentId) {
    lines.push(`Parent ID: ${page.parentId}`);
  }

  const ancestorsLine = renderAncestorsLine(page);
  if (ancestorsLine) {
    lines.push(ancestorsLine);
  }

  const createdLine = renderCreatedLine(page);
  if (createdLine) {
    lines.push(createdLine);
  }

  const updatedLine = renderUpdatedLine(page);
  if (updatedLine) {
    lines.push(updatedLine);
  }

  const versionLine = renderVersionLine(page);
  if (versionLine) {
    lines.push(versionLine);
  }

  const labelsLine = renderLabelsLine(page);
  if (labelsLine) {
    lines.push(labelsLine);
  }

  if (options.includeBody) {
    const { markdown, note } = extractBodyMarkdown(page);
    lines.push("");
    lines.push("## Content");
    lines.push("");
    if (markdown) {
      lines.push(markdown.trim());
    } else {
      lines.push("_No body content was returned for this page._");
    }
    if (note) {
      lines.push("");
      lines.push(note);
    }
  }

  return collapseBlankLines(lines).join("\n");
}

export function renderConfluencePageList(
  pages: ConfluenceV1SearchPage[],
  { hasMore }: { hasMore: boolean }
): string {
  if (pages.length === 0) {
    return "No pages found.";
  }

  const header = `Found ${pages.length} page${pages.length === 1 ? "" : "s"}${hasMore ? " (more available)" : ""}`;
  const sections = pages.map((page) => {
    const includeBody = Boolean(page.body?.storage?.value);
    return ["---", renderConfluencePage(page, { includeBody })].join("\n");
  });

  return [header, ...sections].join("\n\n");
}

export function renderConfluenceSpacesList(
  spaces: ConfluenceSpace[],
  { hasMore }: { hasMore: boolean }
): string {
  if (spaces.length === 0) {
    return "No spaces found.";
  }

  const header = `Found ${spaces.length} space${spaces.length === 1 ? "" : "s"}${hasMore ? " (more available)" : ""}`;
  const sections = spaces.map((space) => {
    return [
      `### ${space.name} (${space.key})`,
      `ID: ${space.id}`,
      space.type ? `Type: ${space.type}` : null,
      space.status ? `Status: ${space.status}` : null,
      space.homepageId ? `Homepage ID: ${space.homepageId}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [header, ...sections].join("\n\n");
}

function renderSpaceLine(page: RenderablePage): string | null {
  const parts: string[] = [];
  if ("spaceId" in page && page.spaceId) {
    parts.push(`ID ${page.spaceId}`);
  }
  if (page.space?.key) {
    parts.push(`Key ${page.space.key}`);
  }
  if (page.space?.name) {
    parts.push(page.space.name);
  }
  if (parts.length === 0) {
    return null;
  }
  return `Space: ${parts.join(" • ")}`;
}

function renderAncestorsLine(page: RenderablePage): string | null {
  const ancestors = page.ancestors ?? [];
  if (ancestors.length === 0) {
    return null;
  }
  const path = ancestors
    .map((ancestor) => ancestor.title?.trim() ?? ancestor.id)
    .join(" / ");
  return `Ancestors: ${path}`;
}

function renderCreatedLine(page: RenderablePage): string | null {
  const createdAt = formatDate(page.createdAt);
  const createdBy = formatUser(page.createdBy);
  if (!createdAt && !createdBy) {
    return null;
  }
  if (createdAt && createdBy) {
    return `Created: ${createdAt} by ${createdBy}`;
  }
  return createdAt ? `Created: ${createdAt}` : `Created by: ${createdBy}`;
}

function renderUpdatedLine(page: RenderablePage): string | null {
  const updatedAt =
    formatDate(page.updatedAt) ?? formatDate(page.version?.createdAt);
  if (!updatedAt) {
    return null;
  }
  return `Last Updated: ${updatedAt}`;
}

function renderVersionLine(page: RenderablePage): string | null {
  const version = page.version;
  if (!version) {
    return null;
  }

  const parts: string[] = [];

  if (typeof version.number === "number") {
    parts.push(`version ${version.number}`);
  }

  const author =
    formatUser(version.createdBy) ??
    (version.authorId ? `account ${version.authorId}` : null);
  if (author) {
    parts.push(`by ${author}`);
  }

  const versionDate = formatDate(version.createdAt);
  if (versionDate) {
    parts.push(`on ${versionDate}`);
  }

  const line = parts.length > 0 ? `Last Edit: ${parts.join(" ")}` : undefined;

  if (version.message && line) {
    return `${line}\nChange Note: ${version.message}`;
  }
  if (version.message) {
    return `Change Note: ${version.message}`;
  }
  return line ?? null;
}

function renderLabelsLine(page: RenderablePage): string | null {
  const labels =
    page.labels?.results?.map((label) => label.name).filter(Boolean) ?? [];
  if (labels.length === 0) {
    return null;
  }
  return `Labels: ${labels.join(", ")}`;
}

function extractBodyMarkdown(page: RenderablePage): {
  markdown: string | null;
  note?: string;
} {
  const body = page.body;
  if (!body) {
    return { markdown: null };
  }

  const storageHtml = body.storage?.value?.trim();
  if (storageHtml) {
    return { markdown: convertHtmlToMarkdown(storageHtml) };
  }

  const storageRepresentation = body.storage?.representation;
  if (storageRepresentation === "storage") {
    return { markdown: convertHtmlToMarkdown(body.storage?.value ?? "") };
  }

  return { markdown: null };
}

function convertHtmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}

function buildPageUrl(links?: ConfluenceLinks): string | null {
  if (!links) {
    return null;
  }
  if (links.base && links.webui) {
    return `${links.base}${links.webui}`;
  }
  if (links.webui && isAbsoluteUrl(links.webui)) {
    return links.webui;
  }
  if (links.base && links.tinyui) {
    return `${links.base}${links.tinyui}`;
  }
  if (links.tinyui && isAbsoluteUrl(links.tinyui)) {
    return links.tinyui;
  }
  return null;
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function formatDate(dateString?: string): string | null {
  if (!dateString) {
    return null;
  }
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function formatUser(user?: ConfluenceUser): string | null {
  if (!user) {
    return null;
  }
  const name = user.displayName ?? user.publicName ?? user.email;
  if (name && user.accountId) {
    return `${name} (Account ID: ${user.accountId})`;
  }
  return name ?? user.accountId ?? null;
}

function collapseBlankLines(lines: string[]): string[] {
  return lines.filter((line, index) => {
    if (line !== "") {
      return true;
    }
    return index === 0 || lines[index - 1] !== "";
  });
}
