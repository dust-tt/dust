import { faker } from "@faker-js/faker";

import { TemplateResource } from "@app/lib/resources/template_resource";
import { CLAUDE_3_5_HAIKU_20241022_MODEL_ID } from "@app/types";

export class TemplateFactory {
  private static defaultParams = () => {
    return {
      description: faker.company.catchPhrase(),
      backgroundColor: "#FFFFFF",
      emoji: faker.internet.emoji(),
      handle: faker.person.firstName(),
      presetTemperature: "balanced" as const,
      presetProviderId: "anthropic" as const,
      presetModelId: CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
      presetActions: [],
      tags: [],
      timeFrameDuration: null,
      timeFrameUnit: null,
      presetDescription: null,
      presetInstructions: null,
      helpInstructions: null,
      helpActions: null,
    };
  };

  static async published() {
    return TemplateResource.makeNew({
      ...this.defaultParams(),
      visibility: "published",
    });
  }

  static async draft() {
    return TemplateResource.makeNew({
      ...this.defaultParams(),
      visibility: "draft",
    });
  }
}
