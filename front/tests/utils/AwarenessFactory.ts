import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

// Sync, in-memory factory: a live document's awareness, with its editor's user when given.
// Built awarenesses are kept until `destroyAll`, so tests release them in one place.
export class AwarenessFactory {
  private static built: Awareness[] = [];

  static build({ user }: { user?: unknown } = {}): Awareness {
    const awareness = new Awareness(new Y.Doc());
    AwarenessFactory.built.push(awareness);
    if (user !== undefined) {
      awareness.setLocalStateField("user", user);
    }
    return awareness;
  }

  static destroyAll() {
    AwarenessFactory.built
      .splice(0)
      .forEach((awareness) => awareness.destroy());
  }
}
