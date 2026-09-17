import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import OpenAI from "openai";
import { analyze } from "./analysis";
import { fetchEmbeddings, fetchSkills, writeReport } from "./cli";
import {
  embedSkills,
  extractSkills,
  readEmbeddings,
  reuseEmbeddings,
} from "./data";
import { demoData } from "./demo";

function skillPayload() {
  return {
    skills: [
      {
        sId: "skill-one",
        name: "Release notes",
        agentFacingDescription: "Explain what shipped.",
        userFacingDescription: "User description",
        instructions: "Read the changes and group them by feature.",
        canRead: true,
        tools: [
          {
            name: "Team GitHub",
            description: null,
            server: {
              name: "github",
              description: "Read code changes.",
              tools: [
                { name: "list_prs", description: "List merged pull requests." },
                { name: "delete_repo", description: "Delete a repository." },
              ],
              sharedSecret: "NEVER-SAVE-THIS",
              customHeaders: { Authorization: "NEVER-SAVE-THIS-EITHER" },
            },
            toolsMetadata: [{ toolName: "delete_repo", enabled: false }],
          },
        ],
      },
    ],
  };
}

test("fetches the workspace public API with auth, status, and editor visibility, then extracts semantic text", async () => {
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer test-key");
    assert.equal(
      request.url,
      "/api/v1/w/workspace-test/skills?status=active&bypassEditorVisibility=true",
    );
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(skillPayload()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const payload = await fetchSkills(
      `http://127.0.0.1:${address.port}`,
      "workspace-test",
      "active",
      true,
      "test-key",
    );
    const [skill] = extractSkills(payload);
    assert.match(skill.text, /Name: Release notes/);
    assert.match(skill.text, /Description: Explain what shipped/);
    assert.match(skill.text, /Instructions:\nRead the changes/);
    assert.match(skill.text, /Team GitHub: Read code changes/);
    assert.match(skill.text, /list_prs: List merged pull requests/);
    assert.doesNotMatch(JSON.stringify(skill), /NEVER-SAVE|delete_repo/);
    assert.ok(skill.tokenCount > 0);
    const denied = skillPayload();
    denied.skills[0].canRead = false;
    assert.throws(() => extractSkills(denied), /redacted/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("checkpoints completed batches, resumes without reembedding, and invalidates changed text", async () => {
  const data = demoData();
  const pending = {
    ...data,
    skills: data.skills.map(({ embedding: _embedding, ...skill }) => skill),
  };
  const directory = await mkdtemp(join(tmpdir(), "skill-embeddings-"));
  const path = join(directory, "embeddings.json");
  let calls = 0;
  await assert.rejects(
    embedSkills(
      pending,
      path,
      async (texts) => {
        calls++;
        if (calls === 2) {
          throw new Error("Simulated provider interruption");
        }
        return texts.map((_, index) => data.skills[index].embedding ?? []);
      },
      () => {},
    ),
    /interruption/,
  );
  const partial = await readEmbeddings(path);
  assert.equal(partial.skills.filter((skill) => skill.embedding).length, 16);
  const resumed = reuseEmbeddings(pending, partial);
  const complete = await embedSkills(
    resumed,
    path,
    async (texts) => {
      assert.equal(texts.length, 8);
      return data.skills.slice(16).map((skill) => skill.embedding ?? []);
    },
    () => {},
  );
  assert.equal(complete.skills.filter((skill) => skill.embedding).length, 24);
  const saved = await readEmbeddings(path);
  assert.deepEqual(saved, complete);
  await embedSkills(
    reuseEmbeddings(pending, saved),
    path,
    async () => {
      assert.fail("Cache should avoid provider calls");
    },
    () => {},
  );
  const changed = {
    ...pending,
    skills: pending.skills.map((skill, index) =>
      index === 0 ? { ...skill, textHash: "changed" } : skill,
    ),
  };
  assert.equal(
    reuseEmbeddings(changed, saved).skills.filter((skill) => !skill.embedding)
      .length,
    1,
  );
  assert.throws(
    () => reuseEmbeddings({ ...pending, dimensions: 3 }, saved),
    /different workspace, endpoint, model, or dimension/,
  );
  await assert.rejects(
    embedSkills(
      pending,
      path,
      async (texts) => texts.map(() => [1, 2]),
      () => {},
    ),
    /invalid dimension/,
  );
});

test("embedding request preserves model, dimensions, text, and response order", async () => {
  const requests: unknown[] = [];
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer embedding-test-key");
    assert.equal(request.url, "/v1/embeddings");
    assert.equal(request.method, "POST");
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push(JSON.parse(body));
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          object: "list",
          model: "text-embedding-3-large",
          data: [
            { object: "embedding", index: 1, embedding: [0, 1] },
            { object: "embedding", index: 0, embedding: [1, 0] },
          ],
          usage: { prompt_tokens: 10, total_tokens: 10 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const client = new OpenAI({
      apiKey: "embedding-test-key",
      baseURL: `http://127.0.0.1:${address.port}/v1`,
    });
    const vectors = await fetchEmbeddings(client, "text-embedding-3-large", 2, [
      "first text",
      "second text",
    ]);
    assert.deepEqual(vectors, [
      [1, 0],
      [0, 1],
    ]);
    assert.deepEqual(requests, [
      {
        model: "text-embedding-3-large",
        dimensions: 2,
        input: ["first text", "second text"],
        encoding_format: "float",
      },
    ]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("PCA preserves a rank-two fixture's distances and gives finite degenerate outputs", () => {
  const demo = demoData();
  const vectors = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [-1, 0, 0, 0],
    [0, -1, 0, 0],
  ];
  const fixture = {
    ...demo,
    dimensions: 4,
    skills: demo.skills
      .slice(0, 4)
      .map((skill, index) => ({ ...skill, embedding: vectors[index] })),
  };
  const result = analyze(fixture, [2], 42);
  assert.ok(
    Math.abs(result.explainedVariance[0] + result.explainedVariance[1] - 1) <
      1e-10,
  );
  const projectedDistance = result.coordinates[0].reduce(
    (sum, value, index) => sum + (value - result.coordinates[2][index]) ** 2,
    0,
  );
  assert.ok(Math.abs(projectedDistance - 4) < 1e-10);
  const singleton = analyze(
    { ...fixture, skills: fixture.skills.slice(0, 1) },
    [2, 5],
    42,
  );
  assert.deepEqual(singleton.coordinates, [[0, 0]]);
  assert.deepEqual(singleton.explainedVariance, [0, 0]);
  assert.equal(singleton.clusters[0].silhouette, null);
  const identical = analyze(
    {
      ...fixture,
      skills: fixture.skills.map((skill) => ({
        ...skill,
        embedding: [1, 0, 0, 0],
      })),
    },
    [2, 10],
    42,
  );
  assert.equal(identical.clusters[0].k, 1);
  assert.ok(identical.coordinates.flat().every((value) => value === 0));
  assert.throws(
    () => analyze({ ...fixture, skills: [] }, [2], 42),
    /No skills/,
  );
});

test("clustering separates known groups reproducibly in full dimensions", () => {
  const data = demoData();
  const result = analyze(data, [3], 42);
  assert.deepEqual(result, analyze(data, [3], 42));
  const cluster = result.clusters[0];
  assert.equal(new Set(cluster.labels.slice(0, 8)).size, 1);
  assert.equal(new Set(cluster.labels.slice(8, 16)).size, 1);
  assert.equal(new Set(cluster.labels.slice(16)).size, 1);
  assert.equal(new Set(cluster.labels).size, 3);
  assert.ok(cluster.silhouette !== null && cluster.silhouette > 0.7);
  assert.ok(
    result.explainedVariance.reduce((sum, value) => sum + value, 0) < 1,
  );
});

test("offline report embeds untrusted content as text without executable markup", async () => {
  const data = demoData();
  const attack = "</script><script>globalThis.skillInjected=true</script>";
  const directory = await mkdtemp(join(tmpdir(), "skill-atlas-report-"));
  const skills = data.skills.map((skill, index) =>
    index === 0 ? { ...skill, name: attack, text: `${attack} $&` } : skill,
  );
  await writeReport({ ...data, skills }, directory, [3], 42);
  const html = await readFile(join(directory, "index.html"), "utf8");
  assert.doesNotMatch(html, /<script>globalThis.skillInjected/);
  assert.match(html, /\\u003c\/script>/);
  assert.doesNotMatch(html, /\/\*__DATA__\*\/|\/\*__VIEWER__\*\//);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  const analysis = JSON.parse(
    await readFile(join(directory, "analysis.json"), "utf8"),
  );
  assert.equal(analysis.skills[0].name, attack);
});
