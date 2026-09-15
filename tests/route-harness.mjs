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
export function loadRoute(path = "app/api/chat/route.ts", fetch = () => { throw new Error("Unexpected network call"); }, env = { GEMINI_API_KEY: testKey }) {
  const logs = [];
  function load(filename) {
    const loadedModule = { exports: {} };
    const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    runInNewContext(outputText, {
      module: loadedModule, exports: loadedModule.exports,
      require: (name) => name.startsWith(".") ? load(resolve(dirname(filename), `${name}.ts`)) : require(name),
      fetch, process: { env }, console: { error: (...args) => logs.push(args) },
      AbortSignal, DOMException, Buffer, URL, Uint8Array, Response,
    }, { filename });
    return loadedModule.exports;
  }
  return { ...load(resolve(root, path)), logs };
}
