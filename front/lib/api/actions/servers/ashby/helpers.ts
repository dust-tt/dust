import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AshbyClient } from "@app/lib/api/actions/servers/ashby/client";
import type { AshbyCandidate } from "@app/lib/api/actions/servers/ashby/types";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

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
