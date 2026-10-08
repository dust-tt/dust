import { formatAgentError } from "@app/components/assistant/conversation/agentErrorMessages";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { describe, expect, it } from "vitest";

const WITH_LOCALISATION = { hasLocalisation: true, viewerIsAdmin: false };
const WITHOUT_LOCALISATION = { hasLocalisation: false, viewerIsAdmin: false };

const overloadedError = {
  code: "multi_actions_error",
  message: "Anthropic is currently overloaded. Please try again in a moment.",
  metadata: {
    category: "retryable_model_error",
    llmErrorType: "overloaded_error",
    provider: "Anthropic",
    isByok: false,
  },
};

describe("formatAgentError", () => {
  it("keeps the raw server title and message without the localisation flag", () => {
    expect(
      formatAgentError(
        {
          code: "max_step_reached",
          message: "This agent took too many steps.",
          metadata: { category: "empty_content", errorTitle: "Too many steps" },
        },
        WITHOUT_LOCALISATION
      )
    ).toEqual({
      title: "Too many steps",
      description: "This agent took too many steps.",
    });
    expect(
      formatAgentError(
        { code: "unknown", message: "Raw message.", metadata: null },
        WITHOUT_LOCALISATION
      )
    ).toEqual({ title: "Something went wrong", description: "Raw message." });
  });

  it("describes a model error from its type and provider, with raw details", () => {
    expect(formatAgentError(overloadedError, WITH_LOCALISATION)).toEqual({
      title: "Something went wrong",
      description: "Anthropic is currently overloaded. Try again in a moment.",
      details:
        "Code: multi_actions_error\nMessage: Anthropic is currently overloaded. Please try again in a moment.",
    });
  });

  it("uses the BYOK description when the workspace brings its own key", () => {
    expect(
      formatAgentError(
        {
          ...overloadedError,
          metadata: {
            ...overloadedError.metadata,
            llmErrorType: "authentication_error",
            isByok: true,
          },
        },
        WITH_LOCALISATION
      ).description
    ).toBe(
      "Your workspace's Anthropic credentials are invalid. Contact your workspace administrator to update them."
    );
  });

  it("falls back to the category when the model error type is missing", () => {
    expect(
      formatAgentError(
        {
          code: "multi_actions_error",
          message: "Legacy message.",
          metadata: { category: "provider_internal_error" },
        },
        WITH_LOCALISATION
      ).description
    ).toBe("The model provider ran into an issue. Try again in a moment.");
  });

  it("describes a credit stop from its blocked reason and the viewer's role", () => {
    const noSeatError = {
      code: "credits_exhausted",
      message: "You don't have a seat assigned in this workspace.",
      metadata: {
        category: "credits_exhausted",
        errorTitle: "No seat assigned",
        blockedReason: "no_seat",
      },
    };
    expect(formatAgentError(noSeatError, WITH_LOCALISATION)).toMatchObject({
      title: "No seat assigned",
      description:
        "You don't have a seat assigned in this workspace. Contact your administrator to assign you one.",
    });
    expect(
      formatAgentError(noSeatError, {
        ...WITH_LOCALISATION,
        viewerIsAdmin: true,
      }).description
    ).toBe(
      "You don't have a seat assigned in this workspace. Go to the usage page to assign yourself one."
    );
  });

  it("describes a trigger limit from its API error type", () => {
    expect(
      formatAgentError(
        {
          code: "plan_message_limit_exceeded",
          message: "Raw limit message.",
          metadata: { errorTitle: "Plan message limit exceeded" },
        },
        WITH_LOCALISATION
      )
    ).toMatchObject({
      title: "Plan message limit exceeded",
      description: "You've reached the message limit of your plan.",
    });
  });

  it("uses the generic messages for an unknown code", () => {
    expect(
      formatAgentError(
        { code: "brand_new_code", message: "Raw message.", metadata: null },
        WITH_LOCALISATION
      )
    ).toEqual({
      title: "Something went wrong",
      description: "An unexpected error occurred.",
      details: "Code: brand_new_code\nMessage: Raw message.",
    });
  });

  it("translates the title, description and details labels", async () => {
    const messages = await loadCatalog("fr-FR");
    i18n.loadAndActivate({ locale: "fr-FR", messages });

    expect(formatAgentError(overloadedError, WITH_LOCALISATION)).toEqual({
      title: "Une erreur s’est produite",
      description:
        "Anthropic est actuellement surchargé. Réessayez dans un instant.",
      details:
        "Code : multi_actions_error\nMessage : Anthropic is currently overloaded. Please try again in a moment.",
    });
    expect(
      formatAgentError(
        {
          code: "max_step_reached",
          message: "Raw message.",
          metadata: { category: "empty_content", errorTitle: "Too many steps" },
        },
        WITH_LOCALISATION
      ).title
    ).toBe("Trop d’étapes");
  });
});
