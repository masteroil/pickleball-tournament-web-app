import { describe, expect, it } from "vitest";
import { rank, validateRules, type StandingMatch } from "../shared/ranking";

const win = (a: string, b: string, x = 15, y = 9): StandingMatch => ({
  a,
  b,
  winner: x > y ? a : b,
  games: [[x, y]],
});

describe("rule presets", () => {
  it("accepts standard side-out configurations from 15.C.1", () => {
    for (const [target, best] of [
      [15, 1],
      [21, 1],
      [11, 3],
      [11, 5],
    ])
      expect(() =>
        validateRules(target, 2, best, "pool", 4, true),
      ).not.toThrow();
    expect(() => validateRules(11, 2, 1, "pool", 6, true)).not.toThrow();
    expect(() => validateRules(11, 2, 5, "playoff", 4, true, true)).toThrow(
      /non-pool/,
    );
  });
  it("rejects invalid official combinations but permits custom scoring", () => {
    for (const [target, margin, best] of [
      [15, 2, 3],
      [11, 1, 3],
      [11, 2, 1],
    ])
      expect(() =>
        validateRules(target, margin, best, "pool", 4, true),
      ).toThrow();
    expect(() => validateRules(11, 1, 1, "pool", 2, false)).not.toThrow();
    expect(() => validateRules(13, 1, 1, "pool", 2, false)).toThrow();
  });
});

describe("recomputed standings", () => {
  it("includes all games in confirmed results and ignores unfinished matches", () => {
    const m: StandingMatch = {
      a: "A",
      b: "B",
      games: [
        [11, 8],
        [5, 11],
        [11, 7],
      ],
      winner: "A",
    };
    const result = rank(["A", "B"], [m, { ...m, winner: "" }], "official");
    expect(result[0]).toMatchObject({
      id: "A",
      wins: 1,
      losses: 0,
      played: 1,
      gamesWon: 2,
      gamesLost: 1,
      pointsFor: 27,
      pointsAgainst: 26,
      diff: 1,
      rank: 1,
    });
    expect(rank(["A", "B"], [m], "official")).toEqual(result);
    expect(rank(["A", "B"], [win("B", "A")], "official")[0].id).toBe("B");
  });
  it("ranks local wild cards on match percentage before points percentage", () => {
    const matches = [
      win("A", "p"),
      win("A", "q"),
      win("r", "A"),
      win("B", "u"),
      win("B", "v"),
      win("w", "B"),
      win("x", "B"),
    ];
    expect(rank(["A", "B"], matches, "local")[0]).toMatchObject({
      id: "A",
      reason: "Match win percentage",
    });
    expect(
      rank(
        ["A", "B"],
        [win("A", "p", 15, 2), win("B", "u", 15, 5)],
        "local",
      )[0],
    ).toMatchObject({ id: "A", reason: "Points won percentage" });
  });
  it("uses the direct local matchup after tied percentages", () => {
    const matches = [win("A", "B"), win("C", "A"), win("B", "D")];
    expect(rank(["A", "B"], matches, "local")[0]).toMatchObject({
      id: "A",
      reason: "Head-to-head result",
    });
  });
  it("uses official head-to-head before overall point differential", () => {
    const matches = [
      win("A", "B", 15, 13),
      win("C", "A", 15, 0),
      win("B", "D", 15, 0),
    ];
    expect(rank(["B", "A"], matches, "official")[0]).toMatchObject({
      id: "A",
      reason: "Head-to-head record",
    });
  });
  it("resolves a circular three-way tie on point differential, independent of input order", () => {
    const m = [
      win("A", "B", 15, 1),
      win("B", "C", 15, 7),
      win("C", "A", 15, 12),
    ];
    const rows = rank(["C", "B", "A"], m, "official");
    expect(rows.map((r) => r.id)).toEqual(["A", "C", "B"]);
    expect(rows[0].reason).toBe("Overall point differential");
    expect(rank(["B", "A", "C"], m.reverse(), "official")).toEqual(rows);
  });
  it("uses head-to-head game differential after tied head-to-head records and equal overall margins", () => {
    const matches = [
      win("A", "B", 15, 5),
      win("B", "A", 15, 11),
      win("A", "x", 15, 13),
      win("B", "y", 15, 1),
    ];
    expect(rank(["A", "B"], matches, "official")[0]).toMatchObject({
      id: "A",
      reason: "Head-to-head point differential",
    });
  });
  it("uses game differential against the next-ranked entrant before total points", () => {
    const matches = [
      win("C", "A", 15, 12),
      win("C", "B", 15, 9),
      win("A", "x", 15, 8),
      win("B", "y", 15, 5),
    ];
    const rows = rank(["A", "B", "C"], matches, "official");
    expect(rows[1]).toMatchObject({
      id: "A",
      reason: "Point differential against the next-ranked opponent",
    });
  });
  it("uses total scored points as the last statistical criterion for equal-size pools", () => {
    const matches = [win("A", "x", 18, 16), win("B", "y", 15, 13)];
    expect(rank(["A", "B"], matches, "official")[0]).toMatchObject({
      id: "A",
      reason: "Total points scored",
    });
    expect(
      rank(["A", "B"], matches, "official", { unequal: true })[0].tied,
    ).toBe(true);
  });
  it("skips prohibited cross-pool criteria when pools have unequal sizes", () => {
    const rows = rank(
      ["B", "A"],
      [win("A", "x", 15, 1), win("B", "y", 15, 13)],
      "official",
      { unequal: true },
    );
    expect(rows.every((r) => r.rank === 1 && r.tied)).toBe(true);
  });
  it("preserves unresolved positions and only accepts a complete administrator ordering", () => {
    const ids = ["B", "A", "C"];
    expect(rank(ids, [], "local", { order: ["B"] }).every((r) => r.tied)).toBe(
      true,
    );
    const decided = rank(ids, [], "local", { order: ["B", "A", "C"] });
    expect(decided.map((r) => r.id)).toEqual(ids);
    expect(decided[0]).toMatchObject({
      rank: 1,
      reason: "Recorded administrator decision",
      tied: false,
    });
  });
  it("drops all results for an excluded round-robin entrant", () => {
    const rows = rank(
      ["A", "B", "C"],
      [win("A", "B"), win("C", "A"), win("B", "C")],
      "official",
      { excluded: ["A"] },
    );
    expect(rows.map((r) => r.id)).toEqual(["B", "C"]);
    expect(rows.map((r) => r.played)).toEqual([1, 1]);
  });
});
