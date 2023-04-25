const _key2val = new Map<string, string>();

export async function cacheGet(key: string) {
  if (!_key2val.has(key)) {
    return undefined;
  }
  return _key2val.get(key);
}

export async function cacheSet(key: string, value: string) {
  _key2val.set(key, value);
}
