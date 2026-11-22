import { describe, expect, it } from "vitest";
import { bracket, guideDivisions, schedule } from "../shared/schedule";

describe("round robin and court allocation", () => {
  it("creates 12 pairings in three four-court slots for the eight-team demo", () => {
    const matches = schedule(
      [
        ["A", "B", "C", "D"],
        ["E", "F", "G", "H"],
      ],
      4,
    );
    expect(matches).toHaveLength(12);
    expect(
      new Set(matches.map((m) => [m.pool, ...[m.a, m.b].sort()].join("|")))
        .size,
    ).toBe(12);
    expect(new Set(matches.map((m) => m.slot)).size).toBe(3);
  });
  it.each([1, 2, 3, 4])(
    "never double-books a court or team with %d courts",
    (courts) => {
      const matches = schedule(
        [
          ["a", "b", "c"],
          ["d", "e", "f", "g", "h"],
        ],
        courts,
        true,
      );
      for (const slot of new Set(matches.map((m) => m.slot))) {
        const simultaneous = matches.filter((m) => m.slot === slot);
        expect(new Set(simultaneous.flatMap((m) => [m.a, m.b])).size).toBe(
          simultaneous.length * 2,
        );
        expect(new Set(simultaneous.map((m) => m.court)).size).toBe(
          simultaneous.length,
        );
        expect(
          simultaneous.every((m) => m.court >= 0 && m.court < courts),
        ).toBe(true);
      }
      expect(matches).toHaveLength(16);
    },
  );
  it("gives each three-team opponent pair a home and return fixture if enabled", () => {
    const matches = schedule([["a", "b", "c"]], 2, true);
    expect(matches).toHaveLength(6);
    for (const m of matches)
      expect(
        matches.some((n) => n.a === m.b && n.b === m.a && n.slot !== m.slot),
      ).toBe(true);
  });
  it("rejects duplicate registration and invalid capacity", () => {
    expect(() => schedule([["a"], ["a"]], 1)).toThrow();
    expect(() => schedule([["a", "b"]], 0)).toThrow();
  });
  it("reconstructs all seven divisions from the guide", () => {
    const counts = guideDivisions.map((d) => {
      const teams = d.sizes.map((n, p) =>
        Array.from({ length: n }, (_, i) => p + "-" + i),
      );
      const entrants = teams.length * d.qualifiersPerPool + d.wildcards;
      return [schedule(teams, 3, d.doubleThree).length, entrants - 1];
    });
    expect(counts).toEqual([
      [34, 7],
      [18, 3],
      [18, 3],
      [18, 3],
      [18, 3],
      [16, 3],
      [10, 3],
    ]);
    expect(counts.flat().reduce((a, b) => a + b, 0)).toBe(157);
  });
});

describe("seeded knockout", () => {
  it("crosses two pools and wires the final to the two semifinals", () => {
    const matches = bracket(["A1", "B1", "A2", "B2"]);
    expect(matches.map((m) => [m.a, m.b])).toEqual([
      ["A1", "B2"],
      ["B1", "A2"],
      ["", ""],
    ]);
    expect(matches[2]).toMatchObject({
      fromA: matches[0].id,
      fromB: matches[1].id,
      round: 1,
    });
  });
  it("uses the guide’s eight-seed draw", () => {
    const quarterfinals = bracket([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]).filter((m) => m.round === 0);
    expect(quarterfinals.map((m) => [m.a, m.b])).toEqual([
      ["1", "8"],
      ["4", "5"],
      ["2", "7"],
      ["3", "6"],
    ]);
  });
  it("feeds top seeds through byes without a phantom result", () => {
    const matches = bracket(["1", "2", "3", "4", "5"]);
    expect(matches).toHaveLength(4);
    expect(matches[0]).toMatchObject({ a: "4", b: "5", round: 0 });
    expect(matches[1]).toMatchObject({
      a: "1",
      b: "",
      fromB: matches[0].id,
      round: 1,
    });
    expect(matches[2]).toMatchObject({ a: "2", b: "3", round: 1 });
    expect(matches[3]).toMatchObject({
      fromA: matches[1].id,
      fromB: matches[2].id,
    });
  });
});
