export type ConnectorsAPIError = {
  message: string;
  type: string;
};

export type ConnectorsAPIErrorResponse = {
  error: ConnectorsAPIError;
};

export function isConnectorsAPIError(obj: unknown): obj is ConnectorsAPIError {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as ConnectorsAPIError).message === "string" &&
    typeof (obj as ConnectorsAPIError).type === "string"
  );
}
