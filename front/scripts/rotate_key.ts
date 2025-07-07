import { hash as blake3 } from "blake3";
import { v4 as uuidv4 } from "uuid";

import {
  KeyResource,
  SECRET_KEY_PREFIX,
} from "@app/lib/resources/key_resource";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    keyId: {
      type: "string",
      demandOption: true,
    },
  },
  async ({ keyId, execute }, logger) => {
    const keyToRotate = await KeyResource.fetchByModelId(keyId);

    //using the same method as the key creation script
    //TODO (stephen): move this to a shared function in the key resource
    const newSecret = `${SECRET_KEY_PREFIX}${Buffer.from(blake3(uuidv4())).toString("hex").slice(0, 32)}`;

    if (!keyToRotate) {
      logger.error("Key not found.");
      return;
    }
    await KeyResource.model.update(
      { secret: newSecret },
      { where: { id: keyToRotate.id } }
    );

    if (execute) {
      logger.info({ keyId }, "rotated key");
    } else {
      logger.warn("Not executing");
    }
  }
);
