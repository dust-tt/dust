import type {
  AgentLoopListToolsContext,
  AgentLoopRunContext,
  SandboxFunctionRunContext,
} from "@app/lib/actions/types";
import { isSystemAuthoredToolContext } from "@app/lib/actions/types";
import type { UserMessageType } from "@app/types/assistant/conversation";
import type { UserType } from "@app/types/user";
import { describe, expect, it } from "vitest";

function userMessage(user: UserType | null): UserMessageType {
  return { user } as UserMessageType;
}

const author = { sId: "u1" } as UserType;

function runContext(user: UserType | null): AgentLoopRunContext {
  return {
    contextType: "agent_loop",
    userMessage: userMessage(user),
  } as AgentLoopRunContext;
}

function listToolsContext(user: UserType | null): AgentLoopListToolsContext {
  return { userMessage: userMessage(user) } as AgentLoopListToolsContext;
}

describe("isSystemAuthoredToolContext", () => {
  it("is true for a run answering an authorless message", () => {
    expect(isSystemAuthoredToolContext({ runContext: runContext(null) })).toBe(
      true
    );
  });

  it("is false for a run answering a message someone wrote", () => {
    expect(
      isSystemAuthoredToolContext({ runContext: runContext(author) })
    ).toBe(false);
  });

  it("applies at listing time too, so personal-only servers never get listed", () => {
    expect(
      isSystemAuthoredToolContext({ listToolsContext: listToolsContext(null) })
    ).toBe(true);
    expect(
      isSystemAuthoredToolContext({
        listToolsContext: listToolsContext(author),
      })
    ).toBe(false);
  });

  it("leaves sandbox function runs alone", () => {
    expect(
      isSystemAuthoredToolContext({
        runContext: {
          contextType: "sandbox_function",
        } as SandboxFunctionRunContext,
      })
    ).toBe(false);
    expect(isSystemAuthoredToolContext(undefined)).toBe(false);
  });
});
