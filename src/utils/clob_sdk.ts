let _module: typeof import('@polymarket/clob-client-v2') | null = null;

export async function loadClobSdk(): Promise<typeof import('@polymarket/clob-client-v2')> {
  if (!_module) {
    _module = await import('@polymarket/clob-client-v2');
  }
  return _module;
}
