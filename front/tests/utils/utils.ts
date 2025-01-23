import { expect, it } from "vitest";

import { frontSequelize } from "@app/lib/resources/storage";

export const itInTransaction = function (
  title: string,
  fn: () => Promise<void>
) {
  return it(title, function () {
    return new Promise<void>((resolve, reject) => {
      frontSequelize
        .transaction(() => {
          return fn()
            .then(() => {
              resolve();
            })
            .catch((err: any) => {
              reject(err);
            })
            .finally(() => {
              throw "Rollback";
            });
        })
        .catch((err: any) => {
          if (err === "Rollback") {
            return;
          }
          reject(err);
          console.log("Error in test:");
          console.log(err);
        });
    });
  });
};

export const expectArrayOfObjectsWithSpecificLength = (
  value: any,
  length: number
) => {
  expect(Array.isArray(value)).toBe(true);
  expect(value).toHaveLength(length);
  expect(
    value.every((item: unknown) => typeof item === "object" && item !== null)
  ).toBe(true);
};
