import { CheckFunction } from "@app/production_checks/types/check";

export const mySuperCheck: CheckFunction = async (
  checkName,
  reportSuccess,
  reportFailure
) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (new Date().getTime() % 3 === 0) {
    await reportSuccess({ message: "Hello world!" });
  } else {
    await reportFailure({ message: "Hello world!" }, "Hello world!");
  }
};
