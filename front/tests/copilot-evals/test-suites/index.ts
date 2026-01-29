import type { TestSuite } from "../lib/types";
import { newAgentSuite } from "./new-agent";

export const allTestSuites: TestSuite[] = [newAgentSuite];
