export class APIError extends Error {
  type: string;

  constructor(type: string, message: string) {
    super(message);
    this.type = type;
  }
}

export const resHandler = async (res: Response) => {
  if (res.status < 300) {
    return res.json();
  }

  let errorType = "unknown";
  let errorMessage = "Unknown error";

  try {
    const resJson = await res.json();
    const error = resJson.error;
    if (error?.type) {
      errorType = error.type;
    }
    errorMessage = error?.message ?? JSON.stringify(error);
  } catch (e) {
    console.error("Error parsing response: ", e);
    errorMessage = await res.text();
  }

  console.error(
    "Error returned by the front API: ",
    res.status,
    res.headers,
    errorMessage
  );
  throw new APIError(errorType, errorMessage);
};
