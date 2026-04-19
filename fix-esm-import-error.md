# Fix: @polymarket/clob-client-v2 ESM Import Error

## Problem

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
node_modules\@polymarket\clob-client-v2\package.json
```

The bot compiles TypeScript to CommonJS (`tsc -p tsconfig.json`), but `@polymarket/clob-client-v2` is likely ESM-only — it doesn't export a CJS entry point.

## Investigate First

1. Read `node_modules/@polymarket/clob-client-v2/package.json` — check the `"exports"`, `"main"`, `"module"`, and `"type"` fields
2. Read `tsconfig.json` — check `"module"`, `"moduleResolution"`, and `"target"` settings
3. Determine if the SDK is truly ESM-only or if there's a CJS build we're not resolving

## Fix Options (try in this order)

### Option A: Dynamic import wrapper
If the SDK is ESM-only, create a wrapper that uses `await import()` (dynamic import works in CJS for ESM packages):

Create `src/utils/clob_sdk.ts`:
```typescript
// Dynamic import wrapper for ESM-only @polymarket/clob-client-v2
let _module: any = null;

export async function loadClobSdk(): Promise<typeof import('@polymarket/clob-client-v2')> {
  if (!_module) {
    _module = await import('@polymarket/clob-client-v2');
  }
  return _module;
}
```

Then update `src/utils/clob_client.ts` to use `loadClobSdk()` instead of a top-level `import { ClobClient } from '@polymarket/clob-client-v2'`. ALL imports from the SDK must go through this dynamic wrapper.

Similarly update any other files that import from `@polymarket/clob-client-v2` directly:
- `src/wallets/polymarket_wallet.ts`
- `src/execution/order_tracker.ts`
- `src/core/config_validator.ts`
- Any test files

### Option B: Change tsconfig to ESM output
Change `tsconfig.json` to output ESM instead of CJS:
- Set `"module": "ES2022"` or `"module": "NodeNext"`
- Set `"moduleResolution": "NodeNext"` or `"Node16"`
- Add `"type": "module"` to `package.json`

**WARNING:** This is a much bigger change — it affects ALL imports across the entire codebase (every `require()` breaks, relative imports need `.js` extensions). Only do this if Option A doesn't work.

### Option C: Check for a CJS build of the SDK
Some packages ship both ESM and CJS. Check:
- `node_modules/@polymarket/clob-client-v2/dist/` — is there a `.cjs` or `cjs/` folder?
- Does the package.json have `"exports": { "require": "..." }` ?
- Is there an older version that ships CJS?

If a CJS build exists, configure the import path to use it explicitly.

## After fixing:

1. `npm run build` — must succeed
2. `npm start` — must start without import errors  
3. `npm test` — all 269 passing tests must still pass (test files may also need the dynamic import fix)
4. Let paper trading run for 5 minutes to confirm trades flow

## Important constraint:
Do NOT change the paper wallet path. The fix must be isolated to how the SDK is imported. Paper trading must continue working exactly as before.
