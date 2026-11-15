import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./load-module.mjs";

test("batch reads isolate synchronous/rejected failures and retain input order", async () => {
  const { readBatch } = await loadModule("src/services/files/batch.ts");
  let finishFirst;
  const pending = readBatch(["first", "sync", "reject", "last"], (name) => {
    if (name === "sync") throw new Error("sync");
    if (name === "reject") return Promise.reject(new Error("rejected"));
    if (name === "first") return new Promise((resolve) => { finishFirst = resolve; });
    return Promise.resolve({ name });
  }, (name) => name);
  finishFirst({ name: "first" });
  const batch = await pending;
  assert.deepEqual(Array.from(batch.files, (file) => file.name), ["first", "last"]);
  assert.deepEqual(Array.from(batch.failed), ["sync", "reject"]);
});

test("native path reads preserve successes and startup invokes the plural command", async () => {
  const { readBatch } = await loadModule("src/services/files/batch.ts");
  const calls = [];
  const platform = await loadModule("src/services/files/platform.ts", {
    "./batch": { readBatch },
    "@tauri-apps/api/core": { invoke: async (command, args) => {
      calls.push([command, args]);
      if (command === "startup_files") return ["one.pdf", "two.PDF"];
      if (args.path.includes("missing")) throw new Error("Not found");
      return new Uint8Array([1, 2]).buffer;
    } },
  }, { window: { __TAURI_INTERNALS__: {} } });
  const batch = await platform.readPaths(["C:\\docs\\one.pdf", "C:\\docs\\missing.pdf", "C:\\docs\\two.PDF"]);
  assert.deepEqual(Array.from(batch.files, (file) => [file.name, file.path]), [
    ["one.pdf", "C:\\docs\\one.pdf"], ["two.PDF", "C:\\docs\\two.PDF"],
  ]);
  assert.deepEqual(Array.from(batch.failed), ["missing.pdf"]);
  assert.deepEqual(await platform.startupFilePaths(), ["one.pdf", "two.PDF"]);
  assert.equal(calls.at(-1)[0], "startup_files");
});

test("browser picker returns readable selections and an empty result on cancel", async () => {
  const { readBatch } = await loadModule("src/services/files/batch.ts");
  let input;
  const platform = await loadModule("src/services/files/platform.ts", {
    "./batch": { readBatch }, "@tauri-apps/api/core": { invoke() { throw new Error("unexpected native call"); } },
  }, { window: {}, document: { createElement: () => (input = { click() {} }) } });
  const pending = platform.pickPdfs();
  assert.equal(input.multiple, true);
  input.files = [
    { name: "missing.pdf", arrayBuffer: async () => { throw new Error("unreadable"); } },
    { name: "valid.pdf", arrayBuffer: async () => new ArrayBuffer(2) },
  ];
  await input.onchange();
  const batch = await pending;
  assert.deepEqual(Array.from(batch.files, (file) => file.name), ["valid.pdf"]);
  assert.deepEqual(Array.from(batch.failed), ["missing.pdf"]);
  const cancelled = platform.pickPdfs(); input.oncancel();
  const empty = await cancelled;
  assert.equal(empty.files.length, 0);
  assert.equal(empty.failed.length, 0);
});
