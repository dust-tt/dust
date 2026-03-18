import config from "@app/lib/api/config";
import { Novu } from "@novu/api";

export const getNovuClient = async (): Promise<Novu> => {
  return new Novu({
    secretKey: config.getNovuSecretKey(),
    serverURL: config.getNovuApiUrl(),
  });
};
