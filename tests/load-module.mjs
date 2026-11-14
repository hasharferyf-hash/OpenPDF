import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import ts from "typescript";

// Run the production TypeScript with small boundary fakes, without adding a
// test framework or requiring PDF.js rendering APIs in Node.
export async function loadModule(path, imports = {}, globals = {}) {
  const url = new URL(path, new URL("../", import.meta.url));
  const source = await readFile(url, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    fileName: fileURLToPath(url),
  });
  const context = createContext({ console, URL, Uint8Array, setTimeout, clearTimeout, ...globals });
  const module = new SourceTextModule(outputText, { context, identifier: url.href });
  await module.link((specifier) => {
    if (!(specifier in imports)) throw new Error(`Unmocked import: ${specifier}`);
    const values = imports[specifier];
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}
