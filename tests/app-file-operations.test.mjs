import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./load-module.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const pdf = (name) => ({ name, data: new Uint8Array([1]) });

async function app(picker = async () => [pdf("one.pdf")], options = {}) {
  const hooks = [], effects = [], calls = [], handles = new Map(), events = new Map();
  const metadata = [];
  let drop;
  const { readBatch } = await loadModule("src/services/files/batch.ts");
  const readPath = options.readPath ?? (async (path) => pdf(path.split(/[\\/]/).pop()));
  const { FileOperations } = await loadModule("src/services/files/operations.ts");
  const { DocumentTabs } = await loadModule("src/services/tabs.ts");
  let cursor = 0, tree, subscribed = false, scheduled = false;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial;
    return [hooks[index], (value) => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }];
  };
  const useRef = (initial) => {
    const index = cursor++;
    hooks[index] ??= { current: initial };
    return hooks[index];
  };
  const element = (type, props) => ({ type, props });
  const findAll = (type, node) => {
    if (!node || typeof node !== "object") return [];
    const children = node.props?.children;
    return [...(node.type === type ? [node] : []), ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap((child) => findAll(type, child))];
  };
  const render = () => {
    cursor = 0;
    tree = module.default();
    for (const view of findAll("DocumentView", tree)) {
      const { id, onReady, onStatus } = view.props;
      if (handles.has(id)) continue;
      const handle = {
        name: null, dirty: false, presenting: false, allowClose: true,
        async load(file) {
          calls.push(["load", id, file.name]); this.name = file.name;
          const update = () => onStatus(id, { name: this.name, modified: this.dirty, presenting: this.presenting, modal: false });
          if (options.deferMetadata) metadata.push(update);
          else update();
        },
        hasDocument() { return this.name !== null; },
        hasUnsavedChanges() { return this.dirty; },
        async confirmClose() { calls.push(["confirm", id]); return this.allowClose; },
        async exitPresentation() { calls.push(["exitPresentation", id]); this.presenting = false; },
        async destroy() { calls.push(["destroy", id]); },
      };
      handles.set(id, handle);
      onReady(id, handle);
    }
  };
  const module = await loadModule("src/App.tsx", {
    react: {
      useState, useRef, useCallback: (fn) => fn, useMemo: (fn) => fn(),
      useEffect: (fn) => effects.push(fn),
      useSyncExternalStore(subscribe, snapshot) {
        if (!subscribed) {
          subscribed = true;
          subscribe(() => {
            if (scheduled) return;
            scheduled = true;
            queueMicrotask(() => { scheduled = false; render(); });
          });
        }
        return snapshot();
      },
    },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "./components/DocumentView": { DocumentView: "DocumentView" },
    "./components/TabStrip": { TabStrip: "TabStrip" },
    "./components/Dialogs": { MessageDialog: "MessageDialog" },
    "./i18n": { I18nContext: { Provider: "Provider" }, initialLanguage: () => "en", storeLanguage() {}, translator: () => (key, values) => key + (values ? `: ${values.names}` : "") },
    "./services/files/operations": { FileOperations },
    "./services/tabs": { DocumentTabs },
    "./services/files/batch": { readBatch },
    "./services/files/platform": {
      fromFiles: (files) => readBatch(files, async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }), (file) => file.name),
      isDesktop: false, isPdfName: (name) => name.toLowerCase().endsWith(".pdf"),
      onNativeFileDrop: async (handlers) => { drop = handlers.onDrop; return () => {}; },
      pickPdfs: async () => { const result = await picker(); return Array.isArray(result) ? { files: result, failed: [] } : result; },
      readPaths: (paths) => readBatch(paths, readPath, (path) => path.split(/[\\/]/).pop()),
      startupFilePaths: async () => options.startup ?? [],
    },
  }, { window: {
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: (name) => events.delete(name),
  } });
  render();
  // Mount queue, startup/drop routing, and keyboard effects at the app boundary.
  effects[1]();
  effects[2]();
  effects[3]();
  const find = (type) => findAll(type, tree)[0];
  return { calls, handles, render, find, events, drop: (paths) => drop(paths), flushMetadata: () => metadata.splice(0).forEach((update) => update()), open: () => find("DocumentView").props.onOpen() };
}

test("opening multiple files creates independent tabs and reuses the initial blank", async () => {
  const fixture = await app(async () => [pdf("one.pdf"), pdf("two.pdf"), pdf("three.pdf")]);
  fixture.open(); await tick();
  const strip = fixture.find("TabStrip").props;
  assert.deepEqual(Array.from(strip.tabs, (tab) => tab.name), ["one.pdf", "two.pdf", "three.pdf"]);
  assert.equal(strip.activeId, strip.tabs[2].id);
  assert.equal(fixture.calls.filter(([name]) => name === "load").length, 3);
});

test("switching tabs preserves each document and its unsaved edits", async () => {
  const fixture = await app(async () => [pdf("one.pdf"), pdf("two.pdf")]);
  fixture.open(); await tick();
  const strip = fixture.find("TabStrip").props;
  const first = fixture.handles.get(strip.tabs[0].id);
  first.dirty = true;
  strip.onActivate(strip.tabs[0].id); await tick();
  assert.equal(fixture.find("TabStrip").props.activeId, strip.tabs[0].id);
  assert.equal(fixture.handles.get(strip.tabs[0].id), first);
  assert.equal(first.dirty, true);
  assert.equal(fixture.calls.some(([name]) => name === "destroy"), false);
});

test("a pending picker excludes duplicate open actions and cancellation leaves tabs intact", async () => {
  let resolve, picks = 0;
  const fixture = await app(() => { picks++; return new Promise((done) => { resolve = done; }); });
  fixture.open(); fixture.open();
  assert.equal(picks, 1);
  resolve([]); await tick();
  assert.equal(fixture.find("TabStrip").props.tabs.length, 1);
  assert.equal(fixture.calls.length, 0);
});

test("opening a new PDF keeps edits made to the existing document while selecting files", async () => {
  let resolve, picks = 0;
  const fixture = await app(() => ++picks === 1 ? Promise.resolve([pdf("one.pdf")]) : new Promise((done) => { resolve = done; }));
  fixture.open(); await tick();
  const firstId = fixture.find("TabStrip").props.activeId;
  fixture.open();
  fixture.handles.get(firstId).dirty = true;
  resolve([pdf("two.pdf")]); await tick();
  assert.equal(fixture.find("TabStrip").props.tabs.length, 2);
  assert.equal(fixture.handles.get(firstId).dirty, true);
  assert.equal(fixture.calls.some(([name]) => name === "confirm" || name === "destroy"), false);
});

test("closing a dirty tab requires confirmation and cancellation preserves it", async () => {
  const fixture = await app(async () => [pdf("one.pdf"), pdf("two.pdf")]);
  fixture.open(); await tick();
  const strip = fixture.find("TabStrip").props;
  const id = strip.tabs[0].id;
  const handle = fixture.handles.get(id);
  handle.dirty = true; handle.allowClose = false;
  strip.onClose(id); await tick();
  assert.equal(fixture.find("TabStrip").props.tabs.length, 2);
  assert.equal(fixture.find("TabStrip").props.activeId, id);
  assert.equal(fixture.calls.some(([name]) => name === "destroy"), false);
  handle.allowClose = true;
  fixture.find("TabStrip").props.onClose(id); await tick();
  assert.equal(fixture.find("TabStrip").props.tabs.length, 1);
  assert.deepEqual(fixture.calls.filter(([name]) => name === "destroy"), [["destroy", id]]);
});

test("Ctrl+Tab selects the next document and Ctrl+W closes only the active one", async () => {
  const fixture = await app(async () => [pdf("one.pdf"), pdf("two.pdf")]);
  fixture.open(); await tick();
  const firstId = fixture.find("TabStrip").props.tabs[0].id;
  const key = (value) => fixture.events.get("keydown")({ key: value, ctrlKey: true, preventDefault() {}, stopPropagation() {} });
  key("Tab"); await tick();
  assert.equal(fixture.find("TabStrip").props.activeId, firstId);
  key("w"); await tick();
  assert.equal(fixture.find("TabStrip").props.tabs.length, 1);
  assert.deepEqual(fixture.calls.filter(([name]) => name === "destroy"), [["destroy", firstId]]);
});

test("closing the last tab leaves a new empty tab", async () => {
  const fixture = await app();
  fixture.open(); await tick();
  const id = fixture.find("TabStrip").props.activeId;
  fixture.find("TabStrip").props.onClose(id); await tick();
  const { tabs, activeId } = fixture.find("TabStrip").props;
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].name, null);
  assert.notEqual(activeId, id);
});

test("a queued shell open cannot replace a loaded tab before React publishes its filename", async () => {
  let resolve;
  const fixture = await app(() => new Promise((done) => { resolve = done; }), { deferMetadata: true });
  fixture.open();
  fixture.drop(["second.pdf"]);
  resolve([pdf("first.pdf")]);
  await tick();
  const loads = fixture.calls.filter(([name]) => name === "load");
  assert.deepEqual(loads.map((entry) => entry[2]), ["first.pdf", "second.pdf"]);
  assert.notEqual(loads[0][1], loads[1][1]);
  assert.equal(fixture.handles.get(loads[0][1]).name, "first.pdf");
  fixture.flushMetadata(); await tick();
  assert.deepEqual(Array.from(fixture.find("TabStrip").props.tabs, (tab) => tab.name), ["first.pdf", "second.pdf"]);
});

test("a failed read in a queued group preserves other files and names the failure", async () => {
  let resolve;
  const fixture = await app(() => new Promise((done) => { resolve = done; }), {
    readPath: async (path) => { if (path === "missing.pdf") throw new Error("missing"); return pdf(path); },
  });
  fixture.open();
  fixture.drop(["two.pdf", "missing.pdf", "three.pdf"]);
  resolve([pdf("one.pdf")]); await tick(); fixture.render();
  assert.deepEqual(Array.from(fixture.find("TabStrip").props.tabs, (tab) => tab.name), ["one.pdf", "two.pdf", "three.pdf"]);
  assert.equal(fixture.find("MessageDialog").props.message, "errorReadFiles: missing.pdf");
});

test("cold startup opens every supplied PDF and preserves their order", async () => {
  const fixture = await app(undefined, { startup: ["one.pdf", "שלום two.PDF", "three.pdf"] });
  await tick();
  assert.deepEqual(Array.from(fixture.find("TabStrip").props.tabs, (tab) => tab.name), ["one.pdf", "שלום two.PDF", "three.pdf"]);
});

test("browser drop opens readable PDFs even when the first file cannot be read", async () => {
  const fixture = await app();
  fixture.find("div").props.onDrop({ preventDefault() {}, dataTransfer: { files: [
    { name: "bad.pdf", arrayBuffer: async () => { throw new Error("unreadable"); } },
    { name: "good.pdf", arrayBuffer: async () => new ArrayBuffer(1) },
  ] } });
  await tick(); fixture.render();
  assert.deepEqual(Array.from(fixture.find("TabStrip").props.tabs, (tab) => tab.name), ["good.pdf"]);
  assert.equal(fixture.find("MessageDialog").props.message, "errorReadFiles: bad.pdf");
});
