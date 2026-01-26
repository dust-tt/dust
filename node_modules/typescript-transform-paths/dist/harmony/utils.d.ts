export type DownSampleTsTypes<TypeMap extends [unknown, unknown][], Tuple extends [...unknown[]]> = {
    [i in keyof Tuple]: Tuple[i] extends unknown[] ? DownSampleTsTypes<TypeMap, Tuple[i]> : DownSampleTsType<TypeMap, Tuple[i]>;
} & {
    length: Tuple["length"];
};
type DownSampleTsType<TypeMap extends [unknown, unknown][], T> = T extends Exclude<TypeMap[number][0], undefined> ? Extract<TypeMap[number], [T, unknown]>[1] : T;
export {};
