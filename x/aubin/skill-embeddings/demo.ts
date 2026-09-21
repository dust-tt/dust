import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeReport } from "./cli";
import type { EmbeddingData } from "./data";
import { extractSkills, saveJson } from "./data";

export function demoData(): EmbeddingData {
  const topics = [
    {
      name: "Engineering",
      description:
        "Investigate software behavior, review changes, and ship reliable code.",
      tools: "GitHub",
      skills: [
        "Review a pull request",
        "Investigate a failing build",
        "Trace a production error",
        "Write a regression test",
        "Plan an API migration",
        "Explain a codebase",
        "Review dependencies",
        "Prepare a release",
      ],
    },
    {
      name: "Customer operations",
      description:
        "Understand customer needs, resolve support cases, and maintain account context.",
      tools: "Zendesk",
      skills: [
        "Triage a support ticket",
        "Summarize account history",
        "Draft a customer reply",
        "Escalate an incident",
        "Prepare a renewal brief",
        "Classify customer feedback",
        "Find duplicate tickets",
        "Build a handoff note",
      ],
    },
    {
      name: "Research",
      description:
        "Gather evidence, compare findings, and communicate a well-supported conclusion.",
      tools: "Web search",
      skills: [
        "Research a market",
        "Compare competitors",
        "Summarize a paper",
        "Verify a claim",
        "Build a source bibliography",
        "Plan user interviews",
        "Synthesize interviews",
        "Draft a research memo",
      ],
    },
  ];
  const skills = extractSkills({
    skills: topics.flatMap((topic, group) =>
      topic.skills.map((name, index) => ({
        sId: `demo-${group}-${index}`,
        name,
        agentFacingDescription: topic.description,
        userFacingDescription: "",
        instructions: `Help with ${name.toLowerCase()}. Gather the relevant context, explain the evidence, and return a concise result with next steps.\n\nThis is synthetic demo content for the ${topic.name.toLowerCase()} group.`,
        canRead: true,
        tools: [
          {
            name: null,
            description: null,
            server: {
              name: topic.tools,
              description: `Access ${topic.tools} to gather evidence.`,
              tools: [
                {
                  name: "search",
                  description: `Find relevant ${topic.name.toLowerCase()} information.`,
                },
              ],
            },
          },
        ],
      })),
    ),
  });
  return {
    version: 1,
    workspace: "synthetic-demo",
    dustUrl: "https://dust.tt",
    status: "active",
    includeUnpublished: false,
    model: "synthetic-demo",
    dimensions: 12,
    createdAt: new Date().toISOString(),
    skills: skills.map((skill, index) => ({
      ...skill,
      embedding: Array.from(
        { length: 12 },
        (_, dimension) =>
          (dimension === Math.floor(index / 8) ? 1 : 0) +
          0.13 * Math.sin((index + 1) * (dimension + 2)),
      ),
    })),
  };
}

async function runDemo() {
  const out = fileURLToPath(new URL("output/synthetic-demo", import.meta.url));
  const data = demoData();
  await saveJson(resolve(out, "embeddings.json"), data);
  await writeReport(data, out, [2, 3, 4, 5, 6, 8], 42);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void runDemo();
}
