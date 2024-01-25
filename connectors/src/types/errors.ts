export type ConnectorsAPIErrorResponse = {
  error: {
    message: string;
    type?: string;
  };
};

export function isScheduleAlreadyRunning(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    err.name === "ScheduleAlreadyRunning"
  );
}
