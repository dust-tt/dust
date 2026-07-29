export async function continueAfterRecordingModelStep<
  TModelResult,
  TContinuationResult,
>({
  modelResult,
  recordModelStep,
  continueStep,
}: {
  modelResult: TModelResult;
  recordModelStep: (result: TModelResult) => void;
  continueStep: (result: TModelResult) => Promise<TContinuationResult>;
}): Promise<TContinuationResult> {
  recordModelStep(modelResult);
  return continueStep(modelResult);
}
