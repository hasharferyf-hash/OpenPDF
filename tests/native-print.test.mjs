import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./load-module.mjs";

const document = { title: "Sample.pdf", pageCount: 200, currentPage: 15 };

test("opens the Windows dialog before serializing the PDF and reuses the selected job", async () => {
  const calls = [];
  const bytes = new Uint8Array([37, 80, 68, 70]);
  let confirm;
  const settings = new Promise((resolve) => { confirm = resolve; });
  const { printWithWindows } = await loadModule("src/services/pdf/nativePrint.ts", {
    "@tauri-apps/api/core": { invoke(command, payload, options) {
      calls.push(command);
      if (command === "choose_native_print") {
        assert.deepEqual({ ...payload }, document);
        return settings;
      }
      assert.equal(payload, bytes);
      assert.equal(options.headers["x-print-job"], "0");
    } },
  });
  const job = printWithWindows(document, async () => {
    calls.push("serialize annotations");
    return bytes;
  }, new AbortController().signal, () => calls.push("show progress"));
  assert.deepEqual(calls, ["choose_native_print"]);
  confirm(0);
  await job;
  assert.deepEqual(calls, [
    "choose_native_print", "show progress", "serialize annotations", "submit_native_print",
  ]);
});

test("dismissed print dialog never prepares document bytes", async () => {
  const commands = [];
  const { printWithWindows } = await loadModule("src/services/pdf/nativePrint.ts", {
    "@tauri-apps/api/core": { invoke: async (command) => { commands.push(command); return null; } },
  });
  await printWithWindows(
    document, () => assert.fail("serialize after cancel"),
    new AbortController().signal, () => assert.fail("progress after cancel"),
  );
  assert.deepEqual(commands, ["choose_native_print"]);
});

test("a failed snapshot releases the accepted printer job", async () => {
  const commands = [];
  const { printWithWindows } = await loadModule("src/services/pdf/nativePrint.ts", {
    "@tauri-apps/api/core": { invoke: async (command, options) => {
      commands.push(command);
      if (command === "choose_native_print") return 123;
      assert.equal(options.id, 123);
    } },
  });
  await assert.rejects(
    printWithWindows(document, async () => { throw new Error("snapshot failed"); },
      new AbortController().signal, () => {}),
    /snapshot failed/,
  );
  assert.deepEqual(commands, ["choose_native_print", "cancel_native_print"]);
});
