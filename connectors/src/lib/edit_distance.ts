// Returns the Levenshtein distance between str1 and str2.
export function editDistance(str1: string, str2: string): number {
  const matrix: number[][] = Array.from({ length: str1.length + 1 }, () =>
    Array(str2.length + 1).fill(0)
  );

  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len1; i++) {
    // @ts-expect-error array of array apparently don't play well with TS
    matrix[i][0] = i;
  }

  for (let j = 0; j <= len2; j++) {
    // @ts-expect-error array of array apparently don't play well with TS
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1.charAt(i - 1) == str2.charAt(j - 1)) {
        // @ts-expect-error array of array apparently don't play well with TS
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        // @ts-expect-error array of array apparently don't play well with TS
        matrix[i][j] = Math.min(
          // @ts-expect-error array of array apparently don't play well with TS
          matrix[i - 1][j - 1] + 1,
          // @ts-expect-error array of array apparently don't play well with TS
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  // @ts-expect-error array of array apparently don't play well with TS
  return matrix[len1][len2];
}

// Test the function
console.log(editDistance("kitten", "sitting")); // Output: 3
