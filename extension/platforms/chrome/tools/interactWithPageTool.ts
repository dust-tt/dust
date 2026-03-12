import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerResult } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Err, Ok } from "@app/types/shared/result";
import { sendInteractWithPageMessage } from "@extension/platforms/chrome/messages";

export async function interactWithPageTool(input: {
  action: "get_elements" | "click_element" | "type_text" | "delete_text";
  tab_id: number;
  element_id?: string | null;
  text?: string | null;
  textActionVariant?: "replace" | "append" | null;
}): Promise<ToolHandlerResult> {
  if (input.action === "type_text") {
    const elementId = input.element_id;
    if (!elementId) {
      return new Err(
        new MCPError("No elementId specified for type_text action")
      );
    }
    const variant = input.textActionVariant;
    if (!variant) {
      return new Err(
        new MCPError("No textActionVariant specified for type_text action")
      );
    }

    const typeResponse = await sendInteractWithPageMessage({
      action: "type_text",
      tabId: input.tab_id,
      elementId,
      text: input.text ?? "",
      variant,
    });
    if (!typeResponse.success) {
      return new Err(
        new MCPError(
          `${typeResponse.error ?? "Unexpected error when typing in element"} ${typeResponse.elementsDiff ? `Elements diff: ${typeResponse.elementsDiff}` : ""}`
        )
      );
    }
    return new Ok([
      {
        type: "text",
        text: `Text inserted successfully. ${typeResponse.elementsDiff ? `Elements diff: ${typeResponse.elementsDiff}` : ""}`,
      },
    ]);
  }

  if (input.action === "delete_text") {
    const elementId = input.element_id;
    if (!elementId) {
      return new Err(
        new MCPError("No elementId specified for delete_text action")
      );
    }

    const typeResponse = await sendInteractWithPageMessage({
      action: "delete_text",
      tabId: input.tab_id,
      elementId,
    });
    if (!typeResponse.success) {
      return new Err(
        new MCPError(
          `${typeResponse.error ?? "Unexpected error when deleting text in element"} ${typeResponse.elementsDiff ? `Elements diff: ${typeResponse.elementsDiff}` : ""}`
        )
      );
    }
    return new Ok([
      {
        type: "text",
        text: `Text deleted successfully. ${typeResponse.elementsDiff ? `Elements diff: ${typeResponse.elementsDiff}` : ""}`,
      },
    ]);
  }

  if (input.action === "click_element") {
    const elementId = input.element_id;
    if (!elementId) {
      return new Err(
        new MCPError("No elementId specified for click_element action")
      );
    }
    const clickResponse = await sendInteractWithPageMessage({
      action: "click_element",
      tabId: input.tab_id,
      elementId,
    });

    if (!clickResponse.success) {
      return new Err(
        new MCPError(
          `${clickResponse.error ?? "Unexpected error when clicking element"} ${clickResponse.elementsDiff ? `Elements diff: ${clickResponse.elementsDiff}` : ""}`
        )
      );
    }

    return new Ok([
      {
        type: "text",
        text: `Button clicked successfully. ${clickResponse.elementsDiff ? `Elements diff: ${clickResponse.elementsDiff}` : ""}`,
      },
    ]);
  }

  const response = await sendInteractWithPageMessage({
    action: "get_elements",
    tabId: input.tab_id,
  });

  if (!response) {
    return new Err(
      new MCPError("No response received from background script.")
    );
  }

  if (response.error) {
    return new Err(new MCPError(`Error: ${response.error}`));
  }

  return new Ok([
    {
      type: "text",
      text: response.elements,
    },
  ]);
}
