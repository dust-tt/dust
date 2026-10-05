export function formatBatchSuggestionDirective(batch: { sId: string }): string {
  return `:batch_edit[]{sId=${batch.sId}}`;
}
