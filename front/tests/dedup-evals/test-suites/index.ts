import type { DedupTestSuite } from "@app/tests/dedup-evals/lib/types";
import { todoDeduplicationSuite } from "@app/tests/dedup-evals/test-suites/todo-deduplication";

export const allTestSuites: DedupTestSuite[] = [todoDeduplicationSuite];
