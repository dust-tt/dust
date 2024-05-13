import type { DustAppSecretType } from "@dust-tt/types";
import { decrypt, redactString } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { DustAppSecret } from "@app/lib/models/workspace";

export async function getDustAppSecrets(
  auth: Authenticator,
  clear = false
): Promise<DustAppSecretType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const secrets = await DustAppSecret.findAll({
    where: {
      workspaceId: owner.id,
    },
    order: [["name", "DESC"]],
  });

  return secrets.map((s) => {
    const clearSecret = decrypt(s.hash, owner.sId);
    return {
      name: s.name,
      value: clear ? clearSecret : redactString(clearSecret, 1),
    };
  });
}

export async function getDustAppSecret(
  auth: Authenticator,
  name: string
): Promise<DustAppSecret | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  const secret = await DustAppSecret.findOne({
    where: {
      name: name,
      workspaceId: owner.id,
    },
  });

  if (!secret) {
    return null;
  }

  return secret;
}
