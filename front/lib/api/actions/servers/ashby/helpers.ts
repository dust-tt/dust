import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AshbyClient } from "@app/lib/api/actions/servers/ashby/client";
// biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
import { renderReferralForm } from "@app/lib/api/actions/servers/ashby/rendering";
import type {
  AshbyCandidate,
  AshbyFieldSubmission,
  AshbyJob,
  AshbyReferralFormInfo,
  AshbyUser,
} from "@app/lib/api/actions/servers/ashby/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";

export const JOB_FIELD_PATH = "_systemfield.job";

interface CandidateSearchParams {
  email?: string;
  name?: string;
}

export async function assertCandidateNotHired(
  client: AshbyClient,
  candidate: AshbyCandidate
): Promise<Result<void, MCPError>> {
  if (!candidate.applicationIds) {
    return new Ok(undefined);
  }

  for (const applicationId of candidate.applicationIds) {
    const appInfoResult = await client.getApplicationInfo({ applicationId });
    if (appInfoResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to retrieve application info for candidate ${candidate.name}.`
        )
      );
    }

    if (appInfoResult.value.results.status === "Hired") {
      return new Err(
        new MCPError(
          `Candidate ${candidate.name} was hired, this operation is not permitted for hired candidates.`,
          {
            tracked: false,
          }
        )
      );
    }
  }

  return new Ok(undefined);
}

export async function findUniqueCandidate(
  client: AshbyClient,
  { email, name }: CandidateSearchParams
): Promise<Result<AshbyCandidate, MCPError>> {
  if (!email && !name) {
    return new Err(
      new MCPError(
        "At least one search parameter (email or name) must be provided.",
        { tracked: false }
      )
    );
  }

  const searchResult = await client.searchCandidates({ email, name });
  if (searchResult.isErr()) {
    return new Err(
      new MCPError(`Failed to search candidates: ${searchResult.error.message}`)
    );
  }

  const candidates = searchResult.value.results;
  if (!candidates || candidates.length === 0) {
    return new Err(
      new MCPError("No candidates found matching the search criteria.", {
        tracked: false,
      })
    );
  }

  if (candidates.length > 1) {
    const candidatesList = candidates
      .map(
        (c, i) =>
          `${i + 1}. ${c.name} (${c.primaryEmailAddress?.value ?? "no email"})`
      )
      .join("\n");
    return new Err(
      new MCPError(
        `Multiple candidates found. Please refine your search:\n\n${candidatesList}`,
        {
          tracked: false,
        }
      )
    );
  }

  return new Ok(candidates[0]);
}

export async function withAuth<T>(
  { authInfo }: ToolHandlerExtra,
  action: (token: string) => Promise<Result<T, MCPError>>
): Promise<Result<T, MCPError>> {
  const token = authInfo?.token;
  if (!token) {
    return new Err(new MCPError("No access token provided"));
  }

  return action(token);
}

function normalizeTitle(title: string): string {
  return title
    .replace(/[*_~`#]/g, "")
    .toLowerCase()
    .trim();
}

export async function resolveAshbyUser(
  client: AshbyClient,
  { auth }: ToolHandlerExtra
): Promise<Result<AshbyUser, MCPError>> {
  const user = auth.user();
  if (!user) {
    return new Err(
      new MCPError(
        "No authenticated user found. " +
          "A user is required to credit the referral to the correct person.",
        { tracked: false }
      )
    );
  }

  const ashbyUserResult = await client.searchUser({ email: user.email });
  if (ashbyUserResult.isErr()) {
    return new Err(
      new MCPError(
        `Failed to find Ashby user for email ${user.email}: ${ashbyUserResult.error.message}`
      )
    );
  }

  const ashbyUsers = ashbyUserResult.value.results;
  if (ashbyUsers.length === 0) {
    return new Err(
      new MCPError(
        `No Ashby user found for email ${user.email}. ` +
          "The referral must be credited to a valid Ashby user.",
        { tracked: false }
      )
    );
  }

  if (ashbyUsers.length > 1) {
    return new Err(
      new MCPError(
        `Multiple Ashby users found for email ${user.email}. ` +
          "The referral must be credited to a unique Ashby user.",
        { tracked: false }
      )
    );
  }

  return new Ok(ashbyUsers[0]);
}

export function resolveFieldSubmissions(
  form: AshbyReferralFormInfo,
  fieldSubmissions: { title: string; value: string | number | boolean }[],
  {
    jobs,
  }: {
    jobs: AshbyJob[];
  }
): Result<AshbyFieldSubmission[], MCPError> {
  const sections = form.formDefinition?.sections ?? [];

  // Build a normalized title -> path map from the form definition.
  const titleToPath = new Map<string, string>();
  for (const section of sections) {
    for (const fieldWrapper of section.fields) {
      titleToPath.set(
        normalizeTitle(fieldWrapper.field.title),
        fieldWrapper.field.path
      );
    }
  }

  // When the form has no fields, pass titles through as paths (best-effort).
  if (titleToPath.size === 0) {
    return new Ok(
      fieldSubmissions.map((s) => ({ path: s.title, value: s.value }))
    );
  }

  // Match user-provided titles to form field paths.
  const unmatchedTitles: string[] = [];
  const resolved: AshbyFieldSubmission[] = [];

  for (const submission of fieldSubmissions) {
    const path = titleToPath.get(normalizeTitle(submission.title));
    if (!path) {
      unmatchedTitles.push(submission.title);
    } else {
      resolved.push({ path, value: submission.value });
    }
  }

  if (unmatchedTitles.length > 0) {
    return new Err(
      new MCPError(
        `The following field titles don't match any form fields: ` +
          `${unmatchedTitles.join(", ")}.\n\n` +
          `Here is the referral form definition with the available ` +
          `field titles:\n\n${renderReferralForm(form, { jobs })}`,
        {
          tracked: false,
        }
      )
    );
  }

  // Resolve the job field: we need to pass the UUID of the job when creating
  // a referral, but we ask the model to pass the name (easier for the model) and convert it.
  const jobSubmission = resolved.find((s) => s.path === JOB_FIELD_PATH);
  if (isString(jobSubmission?.value)) {
    const jobsByName = new Map(
      jobs.map((j) => [j.title.toLowerCase().trim(), j.id])
    );

    const jobId = jobsByName.get(jobSubmission.value.toLowerCase().trim());
    if (!jobId) {
      const availableJobs = jobs
        .map((j) => `- ${j.title} (${j.status})`)
        .join("\n");
      return new Err(
        new MCPError(
          `Could not find a job matching "${jobSubmission.value}".\n\n` +
            `Available jobs:\n${availableJobs}`,
          {
            tracked: false,
          }
        )
      );
    }
    jobSubmission.value = jobId;
  }

  // Check that all required fields are present.
  const submittedPaths = new Set(resolved.map((s) => s.path));
  const missingFields: string[] = [];
  for (const section of sections) {
    for (const fieldWrapper of section.fields) {
      if (
        fieldWrapper.isRequired &&
        !submittedPaths.has(fieldWrapper.field.path)
      ) {
        missingFields.push(fieldWrapper.field.title.trim());
      }
    }
  }

  if (missingFields.length > 0) {
    return new Err(
      new MCPError(
        `Missing required fields: ${missingFields.join(", ")}.\n\n` +
          `Here is the referral form definition:\n\n${renderReferralForm(form, { jobs })}`,
        {
          tracked: false,
        }
      )
    );
  }

  return new Ok(resolved);
}

export function diagnoseFieldSubmissions(
  form: AshbyReferralFormInfo,
  submissions: AshbyFieldSubmission[],
  {
    jobs,
  }: {
    jobs: AshbyJob[];
  }
): string {
  const sections = form.formDefinition?.sections ?? [];
  const submittedPaths = new Map(submissions.map((s) => [s.path, s.value]));
  const issues: string[] = [];

  for (const section of sections) {
    for (const fieldWrapper of section.fields) {
      const {
        field: { title, path, selectableValues },
        isRequired,
      } = fieldWrapper;
      const submitted = submittedPaths.get(path);

      if (submitted === undefined) {
        if (isRequired) {
          issues.push(`- **${title.trim()}**: required but missing`);
        }
        continue;
      }

      // Check selectable values.
      if (!selectableValues || selectableValues.length === 0) {
        continue;
      }

      const validValues = new Set(selectableValues.map((v) => v.value));
      if (!validValues.has(String(submitted))) {
        const options = selectableValues
          .map((v) => `\`${v.value}\` (${v.label})`)
          .join(", ");
        issues.push(
          `- **${title.trim()}**: value \`${String(submitted)}\` ` +
            `is not a valid option. Valid options: ${options}`
        );
      }
    }
  }

  // Check for submitted paths that don't exist in the form.
  const formPaths = new Set(
    sections.flatMap((s) => s.fields.map((f) => f.field.path))
  );
  for (const [path] of submittedPaths) {
    if (!formPaths.has(path)) {
      issues.push(`- **${path}**: not a valid form field`);
    }
  }

  if (issues.length === 0) {
    return (
      "All submitted fields appear valid. The error may be caused by " +
      "field value formats or constraints not visible in the form definition.\n\n" +
      `Submitted fields:\n` +
      submissions
        .map((s) => `- \`${s.path}\`: ${JSON.stringify(s.value)}`)
        .join("\n") +
      `\n\nForm definition:\n${renderReferralForm(form, { jobs })}`
    );
  }

  return (
    `Found ${issues.length} issue(s) with the submission:\n` +
    issues.join("\n") +
    `\n\nForm definition:\n${renderReferralForm(form, { jobs })}`
  );
}
