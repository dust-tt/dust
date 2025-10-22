// This file demonstrates the type safety improvements
// Delete after review - just for demonstration

import type { GetServiceDataResponseType } from "./service-data";

// Example 1: Generic usage (union of all types)
type GenericResponse = GetServiceDataResponseType;
// serviceData is: GithubAdditionalData | TestServiceData | never

// Example 2: Narrowed to GitHub type
type GitHubResponse = GetServiceDataResponseType<"github">;
// serviceData is: GithubAdditionalData (exact type!)

// Example 3: Narrowed to Test type
type TestResponse = GetServiceDataResponseType<"test">;
// serviceData is: TestServiceData (exact type!)

// Usage in a type-safe fetch function:
async function fetchServiceData<K extends "github" | "test">(
  workspaceId: string,
  connectionId: string,
  kind: K
): Promise<GetServiceDataResponseType<K>> {
  const response = await fetch(
    `/api/w/${workspaceId}/webhook_sources/service-data?connectionId=${connectionId}&kind=${kind}`
  );
  return response.json();
}

// When you call with "github", TypeScript knows the exact return type:
async function example() {
  const githubData = await fetchServiceData("ws123", "conn456", "github");
  // TypeScript knows githubData.serviceData is GithubAdditionalData
  githubData.serviceData.repositories.forEach((repo) => {
    console.log(repo.full_name); // ✅ Type-safe!
  });

  const testData = await fetchServiceData("ws123", "conn456", "test");
  // TypeScript knows testData.serviceData is TestServiceData
  console.log(testData.serviceData.info); // ✅ Type-safe!
  console.log(testData.serviceData.timestamp); // ✅ Type-safe!
}

// Example 4: Adding a new preset requires ZERO changes to this file
// Just add the preset to WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP and you're done!

export { example };
