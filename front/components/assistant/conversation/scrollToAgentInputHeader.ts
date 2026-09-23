import { smoothScrollIntoView } from "@app/lib/utils";

export const AGENT_INPUT_HEADER_ID = "agent-input-header";

export async function scrollToAgentInputHeader(): Promise<void> {
  const inputHeader = document.getElementById(AGENT_INPUT_HEADER_ID);
  if (inputHeader) {
    await smoothScrollIntoView({ element: inputHeader });
  }
}
