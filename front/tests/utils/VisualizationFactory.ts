import type { Visualization } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";

type ProtectedVisualization = Extract<Visualization, { code: string }>;
type PublicVisualization = Exclude<Visualization, ProtectedVisualization>;

// Sync, in-memory factory for the `visualization` prop of the Frame iframe components.
export class VisualizationFactory {
  private static counter = 0;

  // A Frame whose code is passed inline, as in authenticated conversations.
  static buildProtected(
    overrides: Partial<ProtectedVisualization> = {}
  ): ProtectedVisualization {
    const id = ++VisualizationFactory.counter;
    return {
      code: "export default function Frame() {}",
      complete: true,
      identifier: `viz-fil_frame_${id}`,
      ...overrides,
    };
  }

  // A Frame whose code is fetched by viz with an access token, as in shared Frames.
  static buildPublic(
    overrides: Partial<PublicVisualization> = {}
  ): PublicVisualization {
    const id = ++VisualizationFactory.counter;
    return {
      accessToken: "token",
      complete: true,
      identifier: `viz-fil_frame_${id}`,
      ...overrides,
    };
  }
}
