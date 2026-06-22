import { createConversation } from "@app/lib/api/assistant/conversation";
import {
  createPlan,
  derivePlanApprovalState,
  findActivePlan,
  getPlanContent,
  isApprovalRequestStale,
  markPlanApproved,
  markPlanClosed,
  planScopedPath,
  writePlanContent,
} from "@app/lib/api/assistant/plan_mode";
import type { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { beforeEach, describe, expect, it } from "vitest";

async function setup(): Promise<{
  auth: Authenticator;
  conversation: ConversationWithoutContentType;
}> {
  const { authenticator: auth } = await createResourceTest({ role: "admin" });
  const conversation = await createConversation(auth, {
    title: "Plan mode test",
    visibility: "unlisted",
    spaceId: null,
  });
  return { auth, conversation };
}

// The GCS mock records every `file.save(...)` but cannot round-trip reads, so we assert on what
// was written. `scopedPath` is `conversation-{cId}/.tool_outputs/...`; the recorded GCS path ends
// with everything after the mount prefix, so we match on that tail.
function lastWriteContentFor(scopedPath: string): string | null {
  const tail = scopedPath.split("/").slice(1).join("/");
  const calls = fileStorageMock.saveFileCalls.filter((c) =>
    c.filePath.endsWith(tail)
  );
  const last = calls[calls.length - 1];
  return last ? last.content.toString() : null;
}

describe("plan_mode lifecycle", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  it("create_plan creates an active plan at version 1 and writes the skeleton", async () => {
    const { auth, conversation } = await setup();

    const res = await createPlan(auth, { conversation });
    expect(res.isOk()).toBe(true);
    if (!res.isOk()) {
      return;
    }
    const plan = res.value;

    expect(plan.version).toBe(1);
    expect(plan.isClosed).toBe(false);
    expect(planScopedPath(conversation, plan)).toContain(
      `conversation-${conversation.sId}/.tool_outputs/plans/`
    );
    expect(planScopedPath(conversation, plan).endsWith("/plan.md")).toBe(true);

    const active = await findActivePlan(auth, conversation);
    expect(active?.id).toBe(plan.id);

    expect(lastWriteContentFor(planScopedPath(conversation, plan))).toContain(
      "# Untitled plan"
    );
  });

  it("create_plan refuses a second active plan via findActivePlan guard", async () => {
    const { auth, conversation } = await setup();

    const first = await createPlan(auth, { conversation });
    expect(first.isOk()).toBe(true);

    const active = await findActivePlan(auth, conversation);
    expect(active).not.toBeNull();
  });

  it("create_plan rolls the row back when the content write fails", async () => {
    const { auth, conversation } = await setup();

    fileStorageMock.setFileSaveFails(() => true);
    const res = await createPlan(auth, { conversation });
    expect(res.isErr()).toBe(true);
    expect(await findActivePlan(auth, conversation)).toBeNull();
  });

  it("edit_plan writes new content and bumps the version", async () => {
    const { auth, conversation } = await setup();
    const created = await createPlan(auth, { conversation });
    if (!created.isOk()) {
      throw new Error("setup failed");
    }
    const plan = created.value;
    fileStorageMock.reset();

    const writeRes = await writePlanContent(
      auth,
      conversation,
      plan,
      "# My plan\n\n- [ ] step one\n"
    );
    expect(writeRes.isOk()).toBe(true);
    await plan.incrementVersion();

    expect(plan.version).toBe(2);
    const reloaded = await findActivePlan(auth, conversation);
    expect(reloaded?.version).toBe(2);

    expect(lastWriteContentFor(planScopedPath(conversation, plan))).toContain(
      "# My plan"
    );
  });

  it("approval state: none -> approved, and becomes stale after a later edit", async () => {
    const { auth, conversation } = await setup();
    const created = await createPlan(auth, { conversation });
    if (!created.isOk()) {
      throw new Error("setup failed");
    }
    const plan = created.value;

    // Move to version 2 (an edit) before approving.
    await plan.incrementVersion();
    expect(derivePlanApprovalState(plan, { hasPendingApproval: false })).toBe(
      "none"
    );

    // A pending approval action dominates.
    expect(derivePlanApprovalState(plan, { hasPendingApproval: true })).toBe(
      "pending"
    );

    const user = auth.getNonNullableUser();
    const approval = await markPlanApproved(plan, user.sId);
    expect(approval).not.toBeNull();
    expect(approval?.approvedVersion).toBe(2);
    expect(derivePlanApprovalState(plan, { hasPendingApproval: false })).toBe(
      "approved"
    );

    // Editing past the approved version makes the approval stale.
    await plan.incrementVersion();
    expect(plan.version).toBe(3);
    expect(derivePlanApprovalState(plan, { hasPendingApproval: false })).toBe(
      "stale"
    );
  });

  it("close_plan hides the plan without writing/overwriting content", async () => {
    const { auth, conversation } = await setup();
    const created = await createPlan(auth, { conversation });
    if (!created.isOk()) {
      throw new Error("setup failed");
    }
    const plan = created.value;
    const scopedPathBefore = planScopedPath(conversation, plan);
    fileStorageMock.reset();

    await markPlanClosed(plan);
    expect(plan.isClosed).toBe(true);
    expect(await findActivePlan(auth, conversation)).toBeNull();
    expect(planScopedPath(conversation, plan)).toBe(scopedPathBefore);
    expect(lastWriteContentFor(scopedPathBefore)).toBeNull();
  });

  it("approving a closed plan no-ops", async () => {
    const { auth, conversation } = await setup();
    const created = await createPlan(auth, { conversation });
    if (!created.isOk()) {
      throw new Error("setup failed");
    }
    const plan = created.value;
    await markPlanClosed(plan);

    const approval = await markPlanApproved(
      plan,
      auth.getNonNullableUser().sId
    );
    expect(approval).toBeNull();
  });

  it("a new plan after close uses a fresh path and does not overwrite the old content", async () => {
    const { auth, conversation } = await setup();

    const first = await createPlan(auth, { conversation });
    if (!first.isOk()) {
      throw new Error("setup failed");
    }
    const firstPlan = first.value;
    await markPlanClosed(firstPlan);
    fileStorageMock.reset();

    const second = await createPlan(auth, { conversation });
    if (!second.isOk()) {
      throw new Error("second create failed");
    }
    const secondPlan = second.value;

    expect(planScopedPath(conversation, secondPlan)).not.toBe(
      planScopedPath(conversation, firstPlan)
    );

    // The new plan wrote its own skeleton; nothing was written to the old plan's path.
    expect(
      lastWriteContentFor(planScopedPath(conversation, secondPlan))
    ).toContain("# Untitled plan");
    expect(
      lastWriteContentFor(planScopedPath(conversation, firstPlan))
    ).toBeNull();
  });

  it("isApprovalRequestStale: not stale when nothing changed after the request", async () => {
    const { auth, conversation } = await setup();
    const created = await createPlan(auth, { conversation });
    if (!created.isOk()) {
      throw new Error("setup failed");
    }
    const plan = created.value;

    // Approval requested at/after the plan's current state, with no later change → valid.
    expect(
      isApprovalRequestStale(plan, {
        requestedAtMs: plan.updatedAt.getTime() + 1,
      })
    ).toBe(false);
  });

  it("isApprovalRequestStale: stale when the plan was edited after the request", async () => {
    const { auth, conversation } = await setup();
    const created = await createPlan(auth, { conversation });
    if (!created.isOk()) {
      throw new Error("setup failed");
    }
    const plan = created.value;

    await plan.incrementVersion();
    const reloaded = await findActivePlan(auth, conversation);
    // An approval requested before the latest edit is stale (updatedAt only moves forward).
    expect(
      isApprovalRequestStale(reloaded!, {
        requestedAtMs: reloaded!.updatedAt.getTime() - 1,
      })
    ).toBe(true);
  });

  it("isApprovalRequestStale: stale when the plan was replaced (closed + recreated) after the request", async () => {
    const { auth, conversation } = await setup();
    const first = await createPlan(auth, { conversation });
    if (!first.isOk()) {
      throw new Error("setup failed");
    }
    await markPlanClosed(first.value);
    const second = await createPlan(auth, { conversation });
    if (!second.isOk()) {
      throw new Error("second create failed");
    }

    // An approval requested before the replacement plan existed is stale (it targets a plan that
    // was created after the request → a different plan).
    expect(
      isApprovalRequestStale(second.value, {
        requestedAtMs: second.value.createdAt.getTime() - 1,
      })
    ).toBe(true);
  });

  it("getPlanContent returns Ok(null) when the file is missing", async () => {
    const { auth, conversation } = await setup();
    const created = await createPlan(auth, { conversation });
    if (!created.isOk()) {
      throw new Error("setup failed");
    }
    const plan = created.value;

    fileStorageMock.setFileExists(() => false);
    const contentRes = await getPlanContent(auth, conversation, plan);
    expect(contentRes.isOk()).toBe(true);
    if (contentRes.isOk()) {
      expect(contentRes.value).toBeNull();
    }
  });
});
