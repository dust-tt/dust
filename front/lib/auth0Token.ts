import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

import config from "@app/lib/api/config";

const AUTH0_DOMAIN = config.getAuth0TenantUrl();
const AUTH0_AUDIENCE = `https://${AUTH0_DOMAIN}/api/v2/`;

export function verifyAuth0Token(
  idToken: string
): Promise<string | jwt.JwtPayload> {
  const client = jwksClient({
    jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
  });

  function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
    client.getSigningKey(header.kid!, (err, key) => {
      if (err) {
        callback(err);
        return;
      }
      if (!key) {
        callback(new Error("Key not found"));
        return;
      }
      const signingKey = key.getPublicKey();
      callback(null, signingKey);
    });
  }

  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getKey,
      {
        algorithms: ["RS256"],
        audience: AUTH0_AUDIENCE,
        issuer: `https://${AUTH0_DOMAIN}/`,
      },
      (err, decoded) => {
        if (err) {
          reject(err);
        } else if (!decoded) {
          reject(new Error("No token payload"));
        } else {
          resolve(decoded);
        }
      }
    );
  });
}
