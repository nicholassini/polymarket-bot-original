let _module: typeof import('@polymarket/clob-client-v2') | null = null;

// Use Function constructor to prevent TypeScript from transforming
// import() into require() — needed for ESM-only packages
const dynamicImport = new Function('specifier', 'return import(specifier)');

export async function loadClobSdk(): Promise<typeof import('@polymarket/clob-client-v2')> {
  if (!_module) {
    _module = await dynamicImport('@polymarket/clob-client-v2');
  }
  return _module!;
}