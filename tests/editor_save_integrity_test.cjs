"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname, "../web/speech-bubble-editor.html"), "utf8");
function section(start, end) {
  const i = html.indexOf(start), j = html.indexOf(end, i + start.length);
  assert.ok(i >= 0 && j > i, `Missing production section: ${start}`);
  return html.slice(i, j);
}
const functions = [
  section("    function updateActionState(){", "    function markLayoutDirty(){"),
  section("    function refreshDirtyState(){", "    function persistDraftNow(){"),
  section("    function persistDraftNow(){", "    function scheduleAutoSave("),
  section("    async function saveLayoutExplicit(){", "    function discardChanges(){"),
  section("    function closeEditor(){", '    document.getElementById("closeEditor")'),
  section('    window.addEventListener("beforeunload",', '    window.addEventListener("pagehide",'),
  section("    async function startStandaloneDocument(", "    async function loadImageBlob("),
].join("\n");
function fixture() {
  const storage = new Map(), requests = [], events = [], statuses = [], handlers = {};
  const button = { textContent: "Save Layout", disabled: false };
  const nodes = { saveLayout: button };
  const c = vm.createContext({ console: { error() {}, warn() {} }, JSON, Promise, clearTimeout() {},
    document: { getElementById: id => nodes[id] || (nodes[id] = {}) },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k) },
    fetch: (url, options) => new Promise(resolve => requests.push({url, options, resolve})),
    setSaveState: (...args) => statuses.push(args), postHost: (...args) => events.push(args),
    currentLayoutJson: () => c.current,
    touchDraftCache() {}, removeDraftCache: id => storage.delete("draft/" + (id || c.documentId)),
    savedLayoutKey: id => "saved/" + (id || c.documentId), draftLayoutKey: id => "draft/" + (id || c.documentId),
    window: { close: () => { c.closed += 1; }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    confirm: () => false, saveEditorWindowState() {}, editorConnectionState: () => ({}),
    cleanupTransientState: () => { c.cleaned += 1; },
  });
  Object.assign(c, { image: { naturalWidth: 640 }, dirtyTrackingEnabled: true, imageLoaded: true, documentId: "image:" + "a".repeat(64), documentMode: "image", imageHash: "a".repeat(64),
    sourceName: "source", forgeApiBase: "/speech-bubble-forge", autoSaveEnabled: true, layoutDirty: true,
    renderRevision: 1, jsonKey: "session", LAST_STANDALONE_ID_KEY: "last-document", lastSavedLayout: "OLD",
    hasExplicitSavedLayout: false, current: "A", editorClosed: false, closed: 0, cleaned: 0,
    layoutSaveInFlight: false, documentContextRevision: 0,
  });
  vm.runInContext(functions, c);
  return {c, storage, requests, events, statuses, handlers, button,
    respond: (ok=true) => requests[0].resolve({ok, status: ok ? 200 : 500, json: async () => ({ok})})};
}
const cases = [];
function test(name, fn) { cases.push([name, fn]); }
function unload(f) { const e = { prevented: false, preventDefault() { this.prevented=true; } }; f.handlers.beforeunload(e); return e; }
test("unchanged save clears only its draft and permits replacement", async () => {
  const f=fixture(); f.storage.set("draft/"+f.c.documentId,"A"); const p=f.c.saveLayoutExplicit(); f.respond();
  assert.equal(await p,true); assert.equal(f.c.layoutDirty,false); assert.equal(f.c.lastSavedLayout,"A");
  assert.equal(f.storage.has("draft/"+f.c.documentId),false); assert.equal(f.button.disabled,false);
});
test("edit while saving keeps new draft and rejects save-and-replace", async () => {
  const f=fixture(), p=f.c.saveLayoutExplicit(); f.c.current="B"; f.c.persistDraftNow(); f.respond();
  assert.equal(await p,false); assert.equal(f.c.lastSavedLayout,"A"); assert.equal(f.c.layoutDirty,true);
  assert.equal(f.storage.get("draft/"+f.c.documentId),"B");
  assert.equal(f.events.some(([name]) => name === "speech_bubble:layout_saved"),false);
  f.c.closeEditor(); assert.equal(f.c.closed,1); assert.equal(f.storage.get("draft/"+f.c.documentId),"B");
});
test("changed content without an existing draft remains dirty", async () => {
  const f=fixture(), p=f.c.saveLayoutExplicit(); f.c.current="B"; f.respond();
  assert.equal(await p,false); assert.equal(f.c.layoutDirty,true); f.c.closeEditor();
  assert.equal(f.storage.get("draft/"+f.c.documentId),"B");
});
test("undo back to the saved snapshot can be marked saved", async () => {
  const f=fixture(), p=f.c.saveLayoutExplicit(); f.c.current="B"; f.c.current="A"; f.respond();
  assert.equal(await p,true); assert.equal(f.c.layoutDirty,false);
});
for (const kind of ["document", "reload", "closed"]) test(`late response after ${kind} cannot change current state`, async () => {
  const f=fixture(), p=f.c.saveLayoutExplicit();
  if(kind==="document") f.c.documentId="image:"+"b".repeat(64);
  if(kind==="reload") f.c.documentContextRevision++;
  if(kind==="closed") f.c.editorClosed=true;
  f.c.current="OTHER"; f.c.lastSavedLayout="OTHER_SAVED"; f.storage.set("draft/"+f.c.documentId,"OTHER"); f.respond();
  assert.equal(await p,false); assert.equal(f.c.lastSavedLayout,"OTHER_SAVED"); assert.equal(f.c.layoutDirty,true);
  assert.equal(f.storage.get("draft/"+f.c.documentId),"OTHER"); assert.equal(f.events.length,0);
});
test("overlapping saves are rejected even when render refreshes controls", async () => {
  const f=fixture(), p=f.c.saveLayoutExplicit(); f.c.updateActionState(); assert.equal(f.button.disabled,true);
  assert.equal(await f.c.saveLayoutExplicit(),false); assert.equal(f.requests.length,1); f.respond(); await p;
});
test("server failure leaves state and drafts intact with a visible error", async () => {
  const f=fixture(); f.storage.set("draft/"+f.c.documentId,"A"); const p=f.c.saveLayoutExplicit(); f.respond(false);
  assert.equal(await p,false); assert.equal(f.c.layoutDirty,true); assert.equal(f.c.lastSavedLayout,"OLD");
  assert.equal(f.storage.get("draft/"+f.c.documentId),"A"); assert.equal(f.statuses.at(-1)[1],"error");
});
for (const kind of ["draft", "last-document"]) test(`${kind} storage failure blocks close without a success notice`, () => {
  const f=fixture(); if(kind==="last-document") { f.c.documentMode="standalone"; f.c.documentId="standalone:test"; }
  const save=f.c.localStorage.setItem;
  f.c.localStorage.setItem=(k,v)=>{ if(kind==="draft" || k==="last-document") {const e=new Error("quota");e.name="QuotaExceededError";throw e;}save(k,v);};
  f.c.closeEditor(); assert.equal(f.c.closed,0); assert.equal(f.c.cleaned,0); assert.equal(f.c.layoutDirty,true);
  assert.equal(f.statuses.at(-1)[1],"error"); assert.equal(f.events.length,0);
});
test("optional session-cache failure does not invalidate a durable draft", () => {
  const f=fixture(), save=f.c.localStorage.setItem;
  f.c.localStorage.setItem=(k,v)=>{if(k==="session")throw new Error("quota");save(k,v);};
  assert.equal(f.c.persistDraftNow(),true); assert.equal(f.storage.get("draft/"+f.c.documentId),"A");
});
test("draft removed by cache cleanup cannot be reported as saved", () => {
  const f=fixture(); f.c.touchDraftCache=()=>f.storage.delete("draft/"+f.c.documentId);
  assert.equal(f.c.persistDraftNow(),false); assert.equal(f.events.length,0);
});
test("retry after quota recovery succeeds", () => {
  const f=fixture(), save=f.c.localStorage.setItem; f.c.localStorage.setItem=()=>{throw new Error("quota");};
  assert.equal(f.c.persistDraftNow(),false); f.c.localStorage.setItem=save; f.c.closeEditor(); assert.equal(f.c.closed,1);
});
test("successful explicit save permits close after autosave failure", async () => {
  const f=fixture(); f.c.localStorage.setItem=()=>{throw new Error("quota");}; f.c.closeEditor(); assert.equal(f.c.closed,0);
  const p=f.c.saveLayoutExplicit(); f.respond(); assert.equal(await p,true); f.c.closeEditor(); assert.equal(f.c.closed,1);
});
for(const enabled of [true,false]) test(`native unload warns on unsaved content (autosave ${enabled})`, () => {
  const f=fixture(); f.c.autoSaveEnabled=enabled; f.c.layoutDirty=false;
  f.c.localStorage.setItem=()=>{throw new Error("quota");};
  assert.equal(unload(f).prevented,true); assert.equal(f.c.editorClosed,false);
});
test("native unload flushes a valid draft", () => {const f=fixture(); assert.equal(unload(f).prevented,false);assert.equal(f.storage.get("draft/"+f.c.documentId),"A");});
test("clean close and autosave-disabled cancel keep prior behavior", () => {
  const f=fixture(); f.c.current="OLD";f.c.closeEditor();assert.equal(f.c.closed,1);
  const g=fixture();g.c.autoSaveEnabled=false;g.c.closeEditor();assert.equal(g.c.closed,0);
});
test("failed autosave cannot switch away from the current document", async () => {
  const f=fixture();f.c.localStorage.setItem=()=>{throw new Error("quota");}; const id=f.c.documentId;
  assert.equal(await f.c.startStandaloneDocument("new",{offerResume:false}),false);assert.equal(f.c.documentId,id);
});
(async()=>{let failed=0;for(const [name,fn] of cases){try{await fn();console.log("PASS",name);}catch(e){failed++;console.error("FAIL",name,e.message);}}console.log(`${cases.length-failed}/${cases.length} save integrity cases passed`);if(failed)process.exitCode=1;})();
