import type { TestSuite } from "@app/tests/conversational-building-evals/lib/types";
import { createAgentSuite } from "@app/tests/conversational-building-evals/test-suites/create-agent";
import { updateSkillSuite } from "@app/tests/conversational-building-evals/test-suites/update-skill";

export const allTestSuites: TestSuite[] = [updateSkillSuite, createAgentSuite];
