import { describe, it, expect } from "vitest";
import { demoDivision, demoTournament } from "../shared/seed";
import { apply, table, qualifiers, playoffs } from "../shared/engine";
import { mutate } from "../shared/service";
import {
  gameWinner,
  matchWinner,
  type Match,
  type Division,
  type Staff,
} from "../shared/model";
const admin: Staff = { uid: "admin", role: "admin" },
  ref: Staff = { uid: "referee", role: "referee" };
const act = (
  d: Division,
  m: Match,
  kind: string,
  data = {},
  actor = admin,
  expected = m.version,
) =>
  apply(
    d,
    demoTournament,
    actor,
    { kind, data, match: m.id, expected, requestId: crypto.randomUUID() },
    100,
  );
describe("scoring and confirmed results", () => {
  it("11–10 continues and 12–10 finishes", () => {
    const r = { target: 11, margin: 2, bestOf: 1 };
    expect(gameWinner([11, 10], r)).toBe(-1);
    expect(gameWinner([12, 10], r)).toBe(0);
  });
  it.each([3, 5])("clinches after a majority of %i games", (bestOf) => {
    const m = demoDivision().matches[0];
    m.rules = { target: 11, margin: 2, bestOf };
    m.games = Array.from({ length: Math.floor(bestOf / 2) }, () => [11, 5]);
    expect(matchWinner(m)).toBe("");
    m.games.push([12, 10]);
    expect(matchWinner(m)).toBe(m.a);
  });
  it("requires assignment, a current version and a valid winner", () => {
    const d = demoDivision(),
      m = d.matches[4];
    expect(() =>
      act(d, m, "point", { side: 0 }, { uid: "other", role: "referee" }),
    ).toThrow("Permission");
    expect(() => act(d, m, "confirm", {}, ref)).toThrow("valid");
    expect(() => act(d, m, "point", { side: 0 }, ref, m.version - 1)).toThrow(
      "Conflict",
    );
    act(d, m, "point", { side: 1 }, ref);
    act(d, m, "undo", {}, ref);
    expect(m.games).toEqual([[8, 6]]);
  });
  it("recalculates after reopening, swapping winner and confirming", () => {
    const d = demoDivision(),
      m = d.matches[0];
    const wins = () => table(d, 0).find((r) => r.id === m.a)!.wins;
    const initial = wins();
    act(d, m, "reopen", { reason: "score sheet" });
    expect(wins()).toBe(initial - 1);
    act(d, m, "correct", { games: [[9, 15]], reason: "verified" });
    act(d, m, "confirm");
    expect(wins()).toBe(initial - 1);
    expect(() => act(d, m, "confirm")).toThrow();
    expect(d.review).toBe(true);
  });
  it("creates semis from confirmed results and advances only on confirmation", () => {
    const d = demoDivision();
    d.matches = d.matches.filter((m) => m.phase === "pool");
    for (const m of d.matches) {
      const a = m.a < m.b;
      m.games = [a ? [15, 8] : [8, 15]];
      m.status = "final";
      m.winner = a ? m.a : m.b;
    }
    const seeds = qualifiers(d);
    expect(seeds).toHaveLength(4);
    d.matches.push(...playoffs(d, 4));
    const semi = d.matches.at(-3)!,
      final = d.matches.at(-1)!;
    act(d, semi, "start");
    act(d, semi, "correct", {
      games: [
        [11, 8],
        [11, 7],
      ],
      reason: "sheet",
    });
    expect(final.a).toBe("");
    act(d, semi, "confirm");
    expect(final.a).toBe(semi.a);
  });
  it("moves new divisions to free slots across the tournament", () => {
    const other = demoDivision(),
      d = demoDivision();
    d.matches = [];
    mutate(
      d,
      demoTournament,
      [other],
      admin,
      { kind: "generate", requestId: "x", expected: 0 },
      0,
    );
    expect(Math.min(...d.matches.map((m) => m.slot))).toBeGreaterThan(
      Math.max(...other.matches.map((m) => m.slot)),
    );
  });
});
