import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { toAgentSearchDocument } from "./documents.ts";
import { DEFAULT_ES_URL, esRequest } from "./es.ts";
import {
  buildAgentSearchQuery,
  buildSpaceClassFilter,
  fetchReferencedSpaces,
} from "./query.ts";
import type { ReferencedSpaces, SearchParams } from "./query.ts";
import type {
  ExportedAgent,
  ProfileSpace,
  UserProfile,
  WorkspaceAgentExport,
} from "./types.ts";

const PROJECT_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const FIXTURES_ROOT = join(PROJECT_ROOT, "assets", "permissions");
const INDEX = `agent_search_permissions_test_${process.pid}`;
const { values } = parseArgs({
  options: {
    es: { type: "string", default: DEFAULT_ES_URL },
  },
});

interface PermissionFixture extends WorkspaceAgentExport {
  permissionTest: {
    nonPodSpaces: ProfileSpace[];
    podSpaces: ProfileSpace[];
    editorEmail: string;
    nonEditorEmail: string;
  };
}

interface PermissionScenario extends UserProfile {
  scenario: string;
  excludeGlobal?: boolean;
  expectedAgentIds: string[];
}

interface BulkResponse {
  errors: boolean;
  items: { index: { error?: unknown } }[];
}

interface SearchResponse {
  hits: { hits: { _id: string }[] };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf-8"));
}

function readableSpaceIds(profile: UserProfile): Set<string> {
  return new Set(
    [...profile.readableNonPodSpaces, ...profile.readablePodSpaces].map(
      (space) => space.sId
    )
  );
}

function expectedAgentIds(
  agents: ExportedAgent[],
  profile: UserProfile,
  excludeGlobal: boolean
): string[] {
  const readableSpaceIdSet = readableSpaceIds(profile);
  return agents
    .filter((agent) => {
      if (agent.status !== "active") {
        return false;
      }
      const hasVisibleScope =
        agent.scope === "visible" ||
        (agent.scope === "global" && !excludeGlobal) ||
        (agent.scope === "hidden" && agent.editors.includes(profile.user.email));
      return (
        hasVisibleScope &&
        agent.requestedSpaceIds.every((spaceId) =>
          readableSpaceIdSet.has(spaceId)
        )
      );
    })
    .map((agent) => agent.sId)
    .sort();
}

async function actualAgentIds(
  esUrl: string,
  profile: UserProfile,
  excludeGlobal: boolean,
  referencedSpaces: Awaited<ReturnType<typeof fetchReferencedSpaces>>,
  agentCount: number
): Promise<string[]> {
  const result = await esRequest<SearchResponse>(
    esUrl,
    "POST",
    `/${INDEX}/_search`,
    JSON.stringify({
      size: agentCount,
      _source: false,
      query: buildAgentSearchQuery(
        searchParamsFor(profile, excludeGlobal, referencedSpaces)
      ),
    })
  );
  return result.hits.hits.map((hit) => hit._id).sort();
}

function searchParamsFor(
  profile: UserProfile,
  excludeGlobal: boolean,
  referencedSpaces: ReferencedSpaces
): SearchParams {
  return {
    readableNonPodSpaceIds: profile.readableNonPodSpaces.map(
      (space) => space.sId
    ),
    readablePodSpaceIds: profile.readablePodSpaces.map((space) => space.sId),
    userGroupIds: profile.groupIds,
    userEmail: profile.user.email,
    searchTerm: "",
    includeInstructions: false,
    minShouldMatch: "",
    matchMode: "best_fields",
    nameFallback: "off",
    excludeGlobal,
    groupBoost: 0,
    referencedSpaces,
  };
}

function numberedSpaceIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

function assertSpaceFilterShapes(): void {
  assert.deepEqual(
    buildSpaceClassFilter("space_ids", "space_count", [], ["a"]),
    { term: { space_count: 0 } },
    "no readable spaces"
  );
  assert.deepEqual(
    buildSpaceClassFilter("space_ids", "space_count", ["a"], ["a"]),
    { match_all: {} },
    "all referenced spaces readable"
  );
  assert.deepEqual(
    buildSpaceClassFilter("space_ids", "space_count", ["a"], [
      "a",
      "b",
      "c",
    ]),
    {
      bool: {
        should: [
          { term: { space_count: 0 } },
          {
            terms_set: {
              space_ids: {
                terms: ["a"],
                minimum_should_match_field: "space_count",
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    "readable side selected"
  );
  assert.deepEqual(
    buildSpaceClassFilter("space_ids", "space_count", ["a", "b"], [
      "a",
      "b",
      "c",
    ]),
    { bool: { must_not: [{ terms: { space_ids: ["c"] } }] } },
    "denied side selected"
  );

  const readableSpaceIds = numberedSpaceIds("readable_", 1200);
  const deniedSpaceIds = numberedSpaceIds("denied_", 1300);
  const budgetFilter = buildSpaceClassFilter(
    "space_ids",
    "space_count",
    readableSpaceIds,
    [...readableSpaceIds, ...deniedSpaceIds]
  );
  assert.equal(
    JSON.stringify(budgetFilter).includes('"must_not"'),
    true,
    "clause budget selects denied side"
  );
}

// Naming a space no agent requests must not change the answer; missing one leaks the agents
// that request it. Front's cached referenced set can lag on deletions, never on additions.
async function assertOverListingIsSafe(
  esUrl: string,
  fixture: PermissionFixture,
  referencedSpaces: ReferencedSpaces
): Promise<void> {
  const profile = profileFor(
    fixture,
    fixture.permissionTest.editorEmail,
    fixture.permissionTest.nonPodSpaces,
    fixture.permissionTest.podSpaces
  );
  const exact = await actualAgentIds(
    esUrl,
    profile,
    false,
    referencedSpaces,
    fixture.agents.length
  );
  const overListed = await actualAgentIds(
    esUrl,
    profile,
    false,
    {
      nonPodSpaceIds: [...referencedSpaces.nonPodSpaceIds, "vlt_never_requested"],
      podSpaceIds: [...referencedSpaces.podSpaceIds, "vlt_never_requested_pod"],
    },
    fixture.agents.length
  );
  assert.deepEqual(overListed, exact, "over-listed referenced spaces");
}

async function assertClauseBudgetQuery(esUrl: string): Promise<void> {
  const readableNonPodSpaceIds = numberedSpaceIds("budget_readable_", 5000);
  const deniedNonPodSpaceIds = numberedSpaceIds("budget_denied_", 5001);
  const query = buildAgentSearchQuery({
    readableNonPodSpaceIds,
    readablePodSpaceIds: [],
    userGroupIds: [],
    userEmail: "member@example.com",
    searchTerm: "",
    includeInstructions: false,
    minShouldMatch: "",
    matchMode: "best_fields",
    nameFallback: "off",
    excludeGlobal: false,
    groupBoost: 0,
    referencedSpaces: {
      nonPodSpaceIds: [
        ...readableNonPodSpaceIds,
        ...deniedNonPodSpaceIds,
      ],
      podSpaceIds: [],
    },
  });
  await esRequest(
    esUrl,
    "POST",
    `/${INDEX}/_search`,
    JSON.stringify({ size: 0, query })
  );
}

function profileFor(
  fixture: PermissionFixture,
  email: string,
  nonPodSpaces: ProfileSpace[],
  podSpaces: ProfileSpace[]
): UserProfile {
  return {
    workspaceId: fixture.workspaceId,
    workspaceName: fixture.workspaceName,
    generatedAt: fixture.generatedAt,
    user: { sId: email, email, fullName: email },
    role: "user",
    groupIds: [],
    groups: [],
    readableNonPodSpaces: nonPodSpaces,
    readablePodSpaces: podSpaces,
  };
}

function subsets<T>(values: T[]): T[][] {
  return Array.from({ length: 2 ** values.length }, (_, mask) =>
    values.filter((_, index) => (mask & (1 << index)) !== 0)
  );
}

async function ingestFixture(
  esUrl: string,
  fixture: PermissionFixture
): Promise<void> {
  await esRequest(
    esUrl,
    "PUT",
    `/${INDEX}`,
    await readFile(
      join(PROJECT_ROOT, "index", "agent_search.mappings.json"),
      "utf-8"
    )
  );
  const lines = fixture.agents.flatMap((agent) => [
    JSON.stringify({ index: { _index: INDEX, _id: agent.sId } }),
    JSON.stringify(toAgentSearchDocument(agent)),
  ]);
  const result = await esRequest<BulkResponse>(
    esUrl,
    "POST",
    "/_bulk",
    `${lines.join("\n")}\n`,
    "application/x-ndjson"
  );
  assert.equal(result.errors, false, JSON.stringify(result.items));
  await esRequest(esUrl, "POST", `/${INDEX}/_refresh`);
}

async function run(): Promise<void> {
  const esUrl = values.es;
  assertSpaceFilterShapes();
  const fixture = await readJson<PermissionFixture>(
    join(FIXTURES_ROOT, "agents_mocked.json")
  );
  assert.equal(fixture.agentCount, fixture.agents.length);
  const multiSpaceAgent = fixture.agents.find(
    (agent) => agent.requestedSpaceIds.length > 1
  );
  assert.ok(multiSpaceAgent, "fixture has no multi-space agent");
  assert.throws(
    () =>
      toAgentSearchDocument({
        ...multiSpaceAgent,
        nonPodSpaceIds: multiSpaceAgent.requestedSpaceIds.map(
          () => multiSpaceAgent.requestedSpaceIds[0]
        ),
        podSpaceIds: [],
      }),
    /do not split/,
    "document conversion accepts a same-length invalid space partition"
  );
  const catalogSpaceIds = [
    ...fixture.permissionTest.nonPodSpaces,
    ...fixture.permissionTest.podSpaces,
  ]
    .map((space) => space.sId)
    .sort();
  const requestedSpaceIds = new Set(
    fixture.agents.flatMap((agent) => agent.requestedSpaceIds)
  );
  assert.equal(
    new Set(catalogSpaceIds).size,
    catalogSpaceIds.length,
    "permission space catalog holds no duplicates"
  );
  // Requested ids may sit outside the catalog on purpose: a space no profile can ever hold
  // stands in for one deleted under front's `canRead(...) ?? false`.
  for (const spaceId of catalogSpaceIds) {
    assert.equal(
      requestedSpaceIds.has(spaceId),
      true,
      `catalog space ${spaceId} is requested by no agent`
    );
  }
  const scenarioFiles = (await readdir(FIXTURES_ROOT))
    .filter((file) => file.startsWith("user_mocked_") && file.endsWith(".json"))
    .sort();
  const scenarios = await Promise.all(
    scenarioFiles.map((file) =>
      readJson<PermissionScenario>(join(FIXTURES_ROOT, file))
    )
  );
  assert.ok(scenarios.length > 0, "no user_mocked_*.json scenarios found");

  try {
    await ingestFixture(esUrl, fixture);
    const referencedSpaces = await fetchReferencedSpaces(esUrl, INDEX);

    for (const scenario of scenarios) {
      const expectedFromModel = expectedAgentIds(
        fixture.agents,
        scenario,
        scenario.excludeGlobal ?? false
      );
      assert.deepEqual(
        [...scenario.expectedAgentIds].sort(),
        expectedFromModel,
        `${scenario.scenario}: fixture expectation`
      );
      const actual = await actualAgentIds(
        esUrl,
        scenario,
        scenario.excludeGlobal ?? false,
        referencedSpaces,
        fixture.agents.length
      );
      assert.deepEqual(actual, expectedFromModel, scenario.scenario);
    }

    const allSpaces = [
      ...fixture.permissionTest.nonPodSpaces,
      ...fixture.permissionTest.podSpaces,
    ];
    // One ES roundtrip per subset per identity, so the sweep is 2^n and worth a ceiling.
    assert.ok(allSpaces.length <= 8, "space catalog too large for a 2^n sweep");
    const allSubsets = subsets(allSpaces);
    const identities = [
      fixture.permissionTest.nonEditorEmail,
      fixture.permissionTest.editorEmail,
    ];
    let exhaustiveCases = 0;

    for (const spaces of allSubsets) {
      const nonPodSpaces = spaces.filter((space) => space.kind !== "project");
      const podSpaces = spaces.filter((space) => space.kind === "project");
      for (const email of identities) {
        const profile = profileFor(
          fixture,
          email,
          nonPodSpaces,
          podSpaces
        );
        const expected = expectedAgentIds(fixture.agents, profile, false);
        const actual = await actualAgentIds(
          esUrl,
          profile,
          false,
          referencedSpaces,
          fixture.agents.length
        );
        assert.deepEqual(
          actual,
          expected,
          `exhaustive spaces=${spaces.map((space) => space.sId).join(",")} email=${email}`
        );
        exhaustiveCases += 1;
      }
    }

    await assertClauseBudgetQuery(esUrl);
    await assertOverListingIsSafe(esUrl, fixture, referencedSpaces);

    process.stdout.write(
      `permissions: ${scenarios.length} named scenarios, ${exhaustiveCases} exhaustive combinations, 5 shape assertions, 1 clause-budget query, and 1 over-listing check passed\n`
    );
  } finally {
    await esRequest(esUrl, "DELETE", `/${INDEX}`);
  }
}

await run();
