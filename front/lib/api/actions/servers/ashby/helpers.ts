import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AshbyClient } from "@app/lib/api/actions/servers/ashby/client";
import { renderReferralForm } from "@app/lib/api/actions/servers/ashby/rendering";
import type {
  AshbyCandidate,
  AshbyFieldSubmission,
  AshbyReferralFormInfoResponse,
  AshbyUser,
} from "@app/lib/api/actions/servers/ashby/types";
import type { Result } from "@app/types";
import { Err, isString, Ok } from "@app/types";

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
  if (candidates.length === 0) {
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
  extra: ToolHandlerExtra,
  action: (token: string) => Promise<Result<T, MCPError>>
): Promise<Result<T, MCPError>> {
  const token = extra.authInfo?.token;
  if (!token) {
    return new Err(new MCPError("No access token provided"));
  }

  return action(token);
}

const JOB_FIELD_PATH = "_systemfield.job";

function normalizeTitle(title: string): string {
  return title
    .replace(/[*_~`#]/g, "")
    .toLowerCase()
    .trim();
}

export async function resolveAshbyUser(
  client: AshbyClient,
  extra: ToolHandlerExtra
): Promise<Result<AshbyUser, MCPError>> {
  const auth = extra.auth;
  if (!auth) {
    return new Err(
      new MCPError("Authentication context not available.", {
        tracked: false,
      })
    );
  }

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

  return new Ok(ashbyUsers[0]);
}

export async function resolveFieldSubmissions(
  client: AshbyClient,
  form: AshbyReferralFormInfoResponse["results"],
  fieldSubmissions: { title: string; value: string | number | boolean }[]
): Promise<Result<AshbyFieldSubmission[], MCPError>> {
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
    const formDefinition = renderReferralForm(form);
    return new Err(
      new MCPError(
        `The following field titles don't match any form fields: ` +
          `${unmatchedTitles.join(", ")}.\n\n` +
          `Here is the referral form definition with the available ` +
          `field titles:\n\n${formDefinition}`,
        { tracked: false }
      )
    );
  }

  // Resolve the job field: if the value is a name, look up its UUID.
  const jobSubmission = resolved.find((s) => s.path === JOB_FIELD_PATH);
  if (jobSubmission && isString(jobSubmission.value)) {
    const jobsResult = await client.listJobs();
    if (jobsResult.isErr()) {
      return new Err(
        new MCPError(`Failed to list jobs: ${jobsResult.error.message}`)
      );
    }

    const jobsByName = new Map(
      jobsResult.value.map((j) => [j.title.toLowerCase().trim(), j.id])
    );

    const normalizedJobName = jobSubmission.value.toLowerCase().trim();
    const jobId = jobsByName.get(normalizedJobName);
    if (!jobId) {
      const availableJobs = jobsResult.value
        .map((j) => `- ${j.title} (${j.status})`)
        .join("\n");
      return new Err(
        new MCPError(
          `Could not find a job matching "${jobSubmission.value}".\n\n` +
            `Available jobs:\n${availableJobs}`,
          { tracked: false }
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
    const formDefinition = renderReferralForm(form);
    return new Err(
      new MCPError(
        `Missing required fields: ${missingFields.join(", ")}.\n\n` +
          `Here is the referral form definition:\n\n${formDefinition}`,
        { tracked: false }
      )
    );
  }

  return new Ok(resolved);
}
