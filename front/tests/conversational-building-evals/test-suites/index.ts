import type { TestSuite } from "@app/tests/conversational-building-evals/lib/types";
import { agentSkillRefsSuite } from "@app/tests/conversational-building-evals/test-suites/agent-skill-refs";
import { batchEditSuite } from "@app/tests/conversational-building-evals/test-suites/batch-edit";
import { createAgentSuite } from "@app/tests/conversational-building-evals/test-suites/create-agent";
import { skillManagementSuite } from "@app/tests/conversational-building-evals/test-suites/skill-management";
import { skillMetadataSuite } from "@app/tests/conversational-building-evals/test-suites/skill-metadata";
import { subAgentRefsSuite } from "@app/tests/conversational-building-evals/test-suites/sub-agent-refs";
import { updateAgentSuite } from "@app/tests/conversational-building-evals/test-suites/update-agent";
import { updateSkillSuite } from "@app/tests/conversational-building-evals/test-suites/update-skill";

export const allTestSuites: TestSuite[] = [
  updateSkillSuite,
  skillManagementSuite,
  skillMetadataSuite,
  createAgentSuite,
  updateAgentSuite,
  batchEditSuite,
  subAgentRefsSuite,
  agentSkillRefsSuite,
];
