import type { DustAppSecretType } from "@app/types/dust_app_secret";

export type GetDustAppSecretsResponseBody = {
  secrets: DustAppSecretType[];
};

export type PostDustAppSecretsResponseBody = {
  secret: DustAppSecretType;
};
