import type { TestSuite } from "../lib/types";
import { instructionsWithContextSuite } from "./instructions-with-context";
import { instructionsWithFeedbackSuite } from "./instructions-with-feedback";
import { instructionsWithToolsSuite } from "./instructions-with-tools";
import { minimalInstructionsSuite } from "./minimal-instructions";
import { newAgentSuite } from "./new-agent";
import { wellStructuredInstructionsSuite } from "./well-structured-instructions";

export const allTestSuites: TestSuite[] = [
  newAgentSuite,
  minimalInstructionsSuite,
  wellStructuredInstructionsSuite,
  instructionsWithToolsSuite,
  instructionsWithContextSuite,
  instructionsWithFeedbackSuite,
];
