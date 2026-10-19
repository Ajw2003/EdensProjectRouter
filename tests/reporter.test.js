import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { REPORTER_PS1, encodeCommand, statusLineCommand, isInstalled, planInstall, planRemove } from "../site/js/reporter.js";

test("encodeCommand is UTF-16LE base64", () => {
  assert.equal(encodeCommand("hi"), Buffer.from("hi", "utf16le").toString("base64"));
  assert.equal(encodeCommand("é·"), Buffer.from("é·", "utf16le").toString("base64"));
});

test("script avoids PowerShell 7-only syntax", () => {
  assert.ok(!REPORTER_PS1.includes("??"));
  assert.ok(!REPORTER_PS1.includes("-AsHashtable"));
  assert.ok(!/\)\s*\?\s*[^\s]+\s*:/.test(REPORTER_PS1));
});

test("statusLineCommand shape", () => {
  const c = statusLineCommand();
  assert.ok(c.startsWith("powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand "));
  assert.equal(c.split(" ").pop(), Buffer.from(REPORTER_PS1, "utf16le").toString("base64"));
});

test("isInstalled", () => {
  assert.equal(isInstalled(""), false);
  assert.equal(isInstalled("{nope"), false);
  assert.equal(isInstalled("{}"), false);
  assert.equal(isInstalled(JSON.stringify({ statusLine: { type: "command", command: statusLineCommand() } })), true);
  assert.equal(isInstalled(JSON.stringify({ statusLine: { type: "command", command: "echo hi" } })), false);
});

test("planInstall on empty settings", () => {
  const p = planInstall("", null);
  assert.equal(p.backupText, "{}");
  assert.equal(p.previousStatusLineJson, "null");
  assert.equal(p.previousCommandText, "");
  assert.equal(JSON.parse(p.settingsText).statusLine.command, statusLineCommand());
  assert.equal(isInstalled(p.settingsText), true);
});

test("planInstall keeps other keys and records old statusLine", () => {
  const orig = JSON.stringify({ model: "x", statusLine: { type: "command", command: "echo old" } });
  const p = planInstall(orig, null);
  assert.equal(p.backupText, orig);
  assert.deepEqual(JSON.parse(p.previousStatusLineJson), { type: "command", command: "echo old" });
  assert.equal(p.previousCommandText, "echo old");
  assert.equal(JSON.parse(p.settingsText).model, "x");
  assert.ok(p.settingsText.includes('\n  "model"'));
});

test("re-install keeps the original previous values", () => {
  const first = planInstall(JSON.stringify({ statusLine: { type: "command", command: "echo old" } }), null);
  const again = planInstall(first.settingsText, first.previousStatusLineJson);
  assert.equal(again.previousStatusLineJson, first.previousStatusLineJson);
  assert.equal(again.previousCommandText, "echo old");
});

test("planInstall refuses invalid JSON in plain English", () => {
  assert.throws(() => planInstall("{ broken", null), /not valid JSON/);
});

test("planRemove restores or deletes", () => {
  const inst = planInstall(JSON.stringify({ a: 1, statusLine: { type: "command", command: "echo old" } }), null);
  assert.deepEqual(JSON.parse(planRemove(inst.settingsText, inst.previousStatusLineJson).settingsText), { a: 1, statusLine: { type: "command", command: "echo old" } });
  const inst2 = planInstall('{"a":1}', null);
  assert.deepEqual(JSON.parse(planRemove(inst2.settingsText, inst2.previousStatusLineJson).settingsText), { a: 1 });
  assert.deepEqual(JSON.parse(planRemove(inst2.settingsText, null).settingsText), { a: 1 });
});

function findPwsh() {
  const cands = [process.env.PWSH, "powershell", "pwsh"].filter(Boolean);
  for (const c of cands) {
    const r = spawnSync(c, ["-NoProfile", "-Command", "1"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return c;
  }
  return null;
}

function runReporter(pwsh, input) {
  const b64 = encodeCommand(REPORTER_PS1);
  return spawnSync(pwsh, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", b64], { input, encoding: "utf8", timeout: 60000 });
}

function makeAccount() {
  const acct = mkdtempSync(path.join(tmpdir(), "router-acct-"));
  mkdirSync(path.join(acct, "projects", "x"), { recursive: true });
  const transcript = path.join(acct, "projects", "x", "s1.jsonl");
  writeFileSync(transcript, "");
  return { acct, transcript };
}

const sample = (transcript) => JSON.stringify({
  session_id: "s1",
  transcript_path: transcript,
  rate_limits: { five_hour: { used_percentage: 12, resets_at: 2000000000 }, seven_day: { used_percentage: 40, resets_at: 2000000000 } },
  context_window: { used_percentage: 34 },
});

test("reporter script runs: writes status and prints line", (t) => {
  const pwsh = findPwsh();
  if (!pwsh) return t.skip("no PowerShell found: set PWSH or put powershell/pwsh on PATH");
  const { acct, transcript } = makeAccount();
  const r = runReporter(pwsh, sample(transcript));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "ctx 34% · 5h 12% · wk 40%");
  const f = path.join(acct, "router", "status", "s1.json");
  assert.ok(existsSync(f));
  const j = JSON.parse(readFileSync(f, "utf8"));
  assert.equal(j.session_id, "s1");
  assert.equal(typeof j.savedAtMs, "number");
  assert.equal(j.rate_limits.five_hour.used_percentage, 12);
});

test("reporter script runs the previous status line command", (t) => {
  const pwsh = findPwsh();
  if (!pwsh) return t.skip("no PowerShell found: set PWSH or put powershell/pwsh on PATH");
  const { acct, transcript } = makeAccount();
  mkdirSync(path.join(acct, "router"), { recursive: true });
  writeFileSync(path.join(acct, "router", "previous-statusline.txt"), "echo PREV\n");
  const r = runReporter(pwsh, sample(transcript));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "PREV");
  assert.ok(existsSync(path.join(acct, "router", "status", "s1.json")));
});

test("reporter script survives garbage stdin", (t) => {
  const pwsh = findPwsh();
  if (!pwsh) return t.skip("no PowerShell found: set PWSH or put powershell/pwsh on PATH");
  const r = runReporter(pwsh, "this is not json");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.trim().length > 0);
});
