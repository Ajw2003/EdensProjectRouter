import test from "node:test";
import assert from "node:assert/strict";
import { readingFromStatus, accountLimits, orderByRoom, accountForNewSession } from "../site/js/limits.js";

const status = {
  session_id: "s1",
  rate_limits: { five_hour: { used_percentage: 12, resets_at: 2000 }, seven_day: { used_percentage: 40, resets_at: 9000 } },
  context_window: { used_percentage: 34 },
  workspace: { repo: { name: "repo" } },
  savedAtMs: 500,
};

test("readingFromStatus maps fields and converts seconds to ms", () => {
  const r = readingFromStatus(status, "a");
  assert.deepEqual(r, { sessionId: "s1", accountId: "a", fiveHourPct: 12, fiveHourResetsAt: 2000000, weeklyPct: 40, weeklyResetsAt: 9000000, contextPct: 34, repoName: "repo", savedAtMs: 500 });
});

test("readingFromStatus tolerates missing parts", () => {
  const r = readingFromStatus({ session_id: "x" }, "a");
  assert.equal(r.fiveHourPct, null);
  assert.equal(r.repoName, null);
  assert.equal(readingFromStatus(null, "a"), null);
});

test("accountLimits picks newest valid and drops expired windows", () => {
  const old = readingFromStatus({ ...status, savedAtMs: 100 }, "a");
  const newer = readingFromStatus({ ...status, session_id: "s2", savedAtMs: 900, rate_limits: { five_hour: { used_percentage: 99, resets_at: 1 }, seven_day: { used_percentage: 50, resets_at: 9000 } } }, "a");
  const res = accountLimits([old, newer], 3000000);
  assert.equal(res.a.sessionId, "s2");
  assert.equal(res.a.fiveHourPct, null);
  assert.equal(res.a.weeklyPct, 50);
  const none = accountLimits([old], 99999999999);
  assert.equal(none.a, undefined);
});

test("orderByRoom: 5h, then weekly, none last, ties by name", () => {
  const accts = [{ id: "n", name: "none" }, { id: "b", name: "b" }, { id: "a", name: "a" }, { id: "c", name: "c" }, { id: "d", name: "d" }];
  const lim = {
    a: { fiveHourPct: 10, weeklyPct: 50 },
    b: { fiveHourPct: 10, weeklyPct: 50 },
    c: { fiveHourPct: 10, weeklyPct: 20 },
    d: { fiveHourPct: 5, weeklyPct: 90 },
  };
  assert.deepEqual(orderByRoom(accts, lim).map((x) => x.id), ["d", "c", "a", "b", "n"]);
});

test("accountForNewSession: the account with the most room, skipping ones without access", () => {
  const accts = [{ id: "a", name: "a", needsPermission: true }, { id: "b", name: "b" }, { id: "c", name: "c" }];
  const lim = { a: { fiveHourPct: 1, weeklyPct: 1 }, b: { fiveHourPct: 50, weeklyPct: 10 }, c: { fiveHourPct: 20, weeklyPct: 90 } };
  assert.equal(accountForNewSession(accts, lim), "c");
  // No readings at all (limit tracking off) still picks an account rather than nothing.
  assert.equal(accountForNewSession([{ id: "x", name: ".claude" }], {}), "x");
  assert.equal(accountForNewSession([], {}), null);
});
