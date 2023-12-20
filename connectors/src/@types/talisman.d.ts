declare module "talisman/metrics/jaro-winkler" {
  const jaroWinkler: {
    (a: string, b: string): number;
    distance: (a: string, b: string) => number;
    similarity: (a: string, b: string) => number;
  };
  export default jaroWinkler;
}
