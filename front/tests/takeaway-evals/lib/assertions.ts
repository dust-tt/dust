import type {
  TakeawayAssertion,
  TakeawayExecutionResult,
} from "@app/tests/takeaway-evals/lib/types";

type AssertionResult = { success: true } | { success: false; error: string };

/**
 * Validate a single takeaway assertion against the actual extraction result.
 */
export function validateTakeawayAssertion(
  assertion: TakeawayAssertion,
  result: TakeawayExecutionResult
): AssertionResult {
  switch (assertion.type) {
    case "shouldExtractActionItem": {
      const match = result.actionItems.find((a) =>
        a.shortDescription
          .toLowerCase()
          .includes(assertion.descriptionContains.toLowerCase())
      );
      if (!match) {
        return {
          success: false,
          error: `Expected an action item containing "${assertion.descriptionContains}", but none was found. Extracted: [${result.actionItems.map((a) => a.shortDescription).join(", ")}]`,
        };
      }
      if (
        assertion.assigneeUserId &&
        match.assigneeUserId !== assertion.assigneeUserId
      ) {
        return {
          success: false,
          error: `Expected action item "${assertion.descriptionContains}" to be assigned to "${assertion.assigneeUserId}", but got "${match.assigneeUserId}"`,
        };
      }
      if (assertion.status && match.status !== assertion.status) {
        return {
          success: false,
          error: `Expected action item "${assertion.descriptionContains}" to have status "${assertion.status}", but got "${match.status}"`,
        };
      }
      return { success: true };
    }

    case "shouldNotExtractActionItem": {
      const match = result.actionItems.find((a) =>
        a.shortDescription
          .toLowerCase()
          .includes(assertion.descriptionContains.toLowerCase())
      );
      if (match) {
        return {
          success: false,
          error: `Expected no action item containing "${assertion.descriptionContains}", but found: "${match.shortDescription}"`,
        };
      }
      return { success: true };
    }

    case "shouldExtractNotableFact": {
      const match = result.notableFacts.find((f) =>
        f.shortDescription
          .toLowerCase()
          .includes(assertion.descriptionContains.toLowerCase())
      );
      if (!match) {
        return {
          success: false,
          error: `Expected a notable fact containing "${assertion.descriptionContains}", but none was found. Extracted: [${result.notableFacts.map((f) => f.shortDescription).join(", ")}]`,
        };
      }
      return { success: true };
    }

    case "shouldExtractKeyDecision": {
      const match = result.keyDecisions.find((d) =>
        d.shortDescription
          .toLowerCase()
          .includes(assertion.descriptionContains.toLowerCase())
      );
      if (!match) {
        return {
          success: false,
          error: `Expected a key decision containing "${assertion.descriptionContains}", but none was found. Extracted: [${result.keyDecisions.map((d) => d.shortDescription).join(", ")}]`,
        };
      }
      if (assertion.status && match.status !== assertion.status) {
        return {
          success: false,
          error: `Expected key decision "${assertion.descriptionContains}" to have status "${assertion.status}", but got "${match.status}"`,
        };
      }
      return { success: true };
    }

    case "minActionItems": {
      if (result.actionItems.length < assertion.count) {
        return {
          success: false,
          error: `Expected at least ${assertion.count} action items, but got ${result.actionItems.length}`,
        };
      }
      return { success: true };
    }

    case "minNotableFacts": {
      if (result.notableFacts.length < assertion.count) {
        return {
          success: false,
          error: `Expected at least ${assertion.count} notable facts, but got ${result.notableFacts.length}`,
        };
      }
      return { success: true };
    }

    case "maxActionItems": {
      if (result.actionItems.length > assertion.count) {
        return {
          success: false,
          error: `Expected at most ${assertion.count} action items, but got ${result.actionItems.length}`,
        };
      }
      return { success: true };
    }

    case "maxKeyDecisions": {
      if (result.keyDecisions.length > assertion.count) {
        return {
          success: false,
          error: `Expected at most ${assertion.count} key decisions, but got ${result.keyDecisions.length}`,
        };
      }
      return { success: true };
    }

    case "maxNotableFacts": {
      if (result.notableFacts.length > assertion.count) {
        return {
          success: false,
          error: `Expected at most ${assertion.count} notable facts, but got ${result.notableFacts.length}`,
        };
      }
      return { success: true };
    }

    case "shouldPreserveSId": {
      let items: { sId: string }[];
      switch (assertion.category) {
        case "actionItem":
          items = result.actionItems;
          break;
        case "notableFact":
          items = result.notableFacts;
          break;
        case "keyDecision":
          items = result.keyDecisions;
          break;
      }
      const found = items.some((item) => item.sId === assertion.sId);
      if (!found) {
        return {
          success: false,
          error: `Expected ${assertion.category} with sId "${assertion.sId}" to be preserved, but it was not found in the result`,
        };
      }
      return { success: true };
    }

    case "shouldNotAssignTo": {
      const badAssignment = result.actionItems.find(
        (a) => a.assigneeUserId === assertion.userId
      );
      if (badAssignment) {
        return {
          success: false,
          error: `Expected no action item assigned to "${assertion.userId}", but found: "${badAssignment.shortDescription}" assigned to "${badAssignment.assigneeUserId}"`,
        };
      }
      return { success: true };
    }
  }
}
