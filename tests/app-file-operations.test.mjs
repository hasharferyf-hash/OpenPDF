import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./load-module.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const openedFile = { name: "new.pdf", path: "C:\\new.pdf", data: new Uint8Array([1]) };

async function app({ picker = async () => openedFile, presenting = false } = {}) {
  const hooks = [];
  const effects = [];
  const calls = [];
  let cursor = 0;
  let tree;
  const element = (type, props) => ({ type, props });
  const useRef = (initial) => {
    const index = cursor++;
    hooks[index] ??= { current: initial };
    return hooks[index];
  };
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial;
    return [hooks[index], (value) => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }];
  };
  const state = { hasDocument: true, presenting, pageCount: 1, tool: "none" };
  const controller = {
    document: {}, dirty: false,
    getState: () => state, getFindState: () => ({}), subscribe: () => () => {},
    hasUnsavedChanges() { return this.dirty; },
    setPresenting(value) { calls.push(["presenting", value]); state.presenting = value; },
    async open() { calls.push(["open"]); state.presenting = false; },
    focus() {},
    async prepareSave() { return { data: new Uint8Array([1]) }; },
    markSaved() { calls.push(["saved"]); },
  };
  const { FileOperations } = await loadModule("src/services/files/operations.ts");
  const components = Object.fromEntries(["Toolbar", "EditorBar", "FindBar", "Sidebar", "Icon", "ConfirmDialog", "MessageDialog", "PasswordDialog", "ProgressDialog", "PropertiesDialog"].map((name) => [name, name]));
  const module = await loadModule("src/App.tsx", {
    react: {
      useState, useRef,
      useEffect: (effect) => { effects.push(effect); },
      useMemo: (fn) => fn(), useCallback: (fn) => fn,
      useSyncExternalStore: (_, snapshot) => snapshot(),
    },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "./components/Dialogs": Object.fromEntries(Object.entries(components).filter(([name]) => name.endsWith("Dialog"))),
    ...Object.fromEntries(["Toolbar", "EditorBar", "FindBar", "Sidebar", "Icon"].map((name) => [`./components/${name}`, { [name]: name }])),
    "./i18n": {
      I18nContext: { Provider: "Provider" }, initialLanguage: () => "en",
      storeLanguage() {}, translator: () => (key) => key,
    },
    "./services/files/operations": { FileOperations },
    "./services/files/platform": {
      baseName: (path) => path, fromFile() {}, isDesktop: true, isPdfName: () => true,
      onNativeFileDrop() {}, openExternal() {}, pickPdf: picker, readPath() {},
      savePdf: async () => "new.pdf", setFullscreen: async (value) => calls.push(["fullscreen", value]),
      setWindowTitle() {}, startupFilePath() {},
    },
    "./services/pdf/print": { printDocument() {} },
    "./services/pdf/viewerController": {
      OpenCancelled: class extends Error {}, PasswordCancelled: class extends Error {},
      ViewerController: class { constructor() { return controller; } },
    },
  });
  const render = () => {
    cursor = 0;
    tree = module.default();
    return tree;
  };
  render();
  // Only mount the controller effect; native/browser effects are boundary APIs.
  hooks[0].current = {};
  hooks[1].current = {};
  effects[0]();
  render();
  const find = (type, node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === type) return node;
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
      const match = find(type, child);
      if (match) return match;
    }
  };
  return { controller, calls, render, find: (type) => find(type, tree) };
}

test("opening from presentation exits native fullscreen before replacing the document", async () => {
  const fixture = await app({ presenting: true });
  // Presentation hides the toolbar, but Ctrl+O uses the same open callback.
  // Temporarily render the toolbar to capture it, then restore presentation.
  fixture.controller.getState().presenting = false;
  fixture.render();
  const open = fixture.find("Toolbar").props.onOpen;
  fixture.controller.getState().presenting = true;
  open();
  await tick();
  assert.deepEqual(fixture.calls, [["fullscreen", false], ["presenting", false], ["open"]]);
});

test("cancelling the picker leaves presentation and the current document intact", async () => {
  const fixture = await app({ picker: async () => null });
  const open = fixture.find("Toolbar").props.onOpen;
  fixture.controller.getState().presenting = true;
  open();
  await tick();
  assert.deepEqual(fixture.calls, []);
  assert.equal(fixture.controller.getState().presenting, true);
});

test("two open actions cannot overlap a pending file picker", async () => {
  let resolvePicker;
  let picks = 0;
  const fixture = await app({ picker: () => { picks++; return new Promise((resolve) => { resolvePicker = resolve; }); } });
  const open = fixture.find("Toolbar").props.onOpen;
  open();
  open();
  assert.equal(picks, 1);
  resolvePicker(openedFile);
  await tick();
  assert.equal(fixture.calls.filter(([name]) => name === "open").length, 1);
});

test("edits made while the picker is pending are checked before the old document is closed", async () => {
  let resolvePicker;
  const fixture = await app({ picker: () => new Promise((resolve) => { resolvePicker = resolve; }) });
  fixture.find("Toolbar").props.onOpen();
  fixture.controller.dirty = true;
  resolvePicker(openedFile);
  await tick();
  fixture.render();
  assert.equal(fixture.calls.length, 0);
  fixture.find("ConfirmDialog").props.onCancel();
  await tick();
  assert.equal(fixture.calls.length, 0, "cancel preserves the original document");
});
