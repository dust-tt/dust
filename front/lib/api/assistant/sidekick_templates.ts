import { getSuggestedTemplatesForQuery } from "@app/lib/api/assistant/template_suggestion";
import type { Authenticator } from "@app/lib/auth";
import { TemplateResource } from "@app/lib/resources/template_resource";
import type { TemplateTagCodeType } from "@app/types/assistant/templates";
import type { JobType } from "@app/types/job_type";
import { isJobType } from "@app/types/job_type";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

const DEFAULT_LIMIT = 10;

export const JOB_TYPE_TO_TEMPLATE_TAGS: Record<JobType, TemplateTagCodeType[]> =
  {
    engineering: ["ENGINEERING"],
    design: ["DESIGN", "UX_DESIGN", "UX_RESEARCH"],
    data: ["DATA"],
    finance: ["FINANCE"],
    legal: ["LEGAL"],
    marketing: ["MARKETING", "CONTENT", "WRITING"],
    operations: ["OPERATIONS"],
    product: ["PRODUCT", "PRODUCT_MANAGEMENT"],
    sales: ["SALES"],
    people: ["HIRING", "RECRUITING"],
    customer_success: ["SUPPORT"],
    customer_support: ["SUPPORT"],
    other: [],
  };

export async function getPublishedTemplatesWithSidekick(): Promise<
  TemplateResource[]
> {
  const all = await TemplateResource.listAll({ visibility: "published" });
  return all.filter((t) => t.sidekickInstructions !== null);
}

export type GetTemplatesForSidekickOptions = {
  auth: Authenticator;
  jobType?: JobType;
  query?: string;
  limit?: number;
};

export async function getTemplatesForSidekick(
  options: GetTemplatesForSidekickOptions
): Promise<Result<TemplateResource[], Error>> {
  const { auth, jobType, query, limit = DEFAULT_LIMIT } = options;
  const allTemplates = await getPublishedTemplatesWithSidekick();

  const matchingTags =
    jobType && isJobType(jobType) ? JOB_TYPE_TO_TEMPLATE_TAGS[jobType] : [];
  const candidates =
    matchingTags.length > 0
      ? allTemplates.filter((t) =>
          t.tags.some((tag) => matchingTags.includes(tag))
        )
      : allTemplates;

  if (query) {
    return getSuggestedTemplatesForQuery(auth, {
      query,
      templates: candidates,
    });
  }

  const templates =
    matchingTags.length > 0 ? candidates : candidates.slice(0, limit);
  return new Ok(templates);
}

function formatOneTemplate(t: TemplateResource): string {
  const lines: string[] = [
    `sId: ${t.sId}`,
    `handle: ${t.handle}`,
    `userFacingDescription: ${t.userFacingDescription ?? ""}`,
    `agentFacingDescription: ${t.agentFacingDescription ?? ""}`,
    `tags: ${t.tags.join(", ") || "none"}`,
  ];
  if (t.sidekickInstructions?.trim()) {
    lines.push(
      "sidekickInstructions:",
      "---",
      t.sidekickInstructions.trim(),
      "---"
    );
  }
  return lines.join("\n");
}

export function formatTemplatesAsText(templates: TemplateResource[]): string {
  if (templates.length === 0) {
    return "No templates found.";
  }
  const blocks = templates.map(
    (t, i) => `## Template ${i + 1}\n${formatOneTemplate(t)}`
  );
  return `Found ${templates.length} template(s):\n\n${blocks.join("\n\n")}`;
}
