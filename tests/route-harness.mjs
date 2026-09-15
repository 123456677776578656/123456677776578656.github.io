import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
export const testKey = "test-secret-only-used-in-isolated-tests";

// Run the actual route in isolation: no real credentials or network requests.
export function loadRoute(path = "app/api/chat/route.ts", fetch = () => { throw new Error("Unexpected network call"); }, env = { GEMINI_API_KEY: testKey }, globals = {}) {
  const logs = [];
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const loadedModule = { exports: {} };
    const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    runInNewContext(outputText, {
      module: loadedModule, exports: loadedModule.exports,
      require: (name) => name.startsWith(".") ? load(resolve(dirname(filename), `${name}.ts`)) : require(name),
      fetch, process: { env }, console: { error: (...args) => logs.push(args) },
      AbortSignal, AbortController, DOMException, Buffer, URL, Uint8Array, Response, ReadableStream, TextEncoder, TextDecoder, ...globals,
    }, { filename });
    cache.set(filename, loadedModule.exports);
    return loadedModule.exports;
  }
  return { ...load(resolve(root, path)), logs };
}
