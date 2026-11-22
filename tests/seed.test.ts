import { describe, expect, it } from "vitest";
import { matchWinner } from "../shared/model";
import { guideEvents, demoDivision, demoTournament } from "../shared/seed";
import { poolSchedule } from "../shared/engine";

describe("demo seed", () => {
  it("has all requested stages, including vacant playoff places", () => {
    const d = demoDivision();
    expect(d.teams.length).toBe(8);
    expect(d.teams.filter((t) => t.players.length === 2)).toHaveLength(8);
    expect(d.matches.filter((m) => m.phase === "pool")).toHaveLength(12);
    expect(d.matches.filter((m) => m.phase === "playoff")).toHaveLength(3);
    expect(
      d.matches.filter((m) => m.phase === "playoff").every((m) => !m.a && !m.b),
    ).toBe(true);
    expect(
      d.matches.filter((m) => m.status === "live").map((m) => m.ref),
    ).toEqual(["referee", "referee2"]);
    for (const m of d.matches.filter((m) => m.status === "final")) {
      expect(m.winner).toBe(matchWinner(m));
      expect(m.confirmedBy).toBeTruthy();
    }
    expect(demoTournament.courts).toHaveLength(4);
  });
  it("creates independent, repeatable fixture trees", () => {
    const first = demoDivision();
    first.matches[0].games[0][0] = -100;
    first.config.sizes[0] = 1;
    expect(demoDivision().matches[0].games[0][0]).toBe(15);
    expect(demoDivision().config.sizes).toEqual([4, 4]);
  });
  it("leaves the seven real-event draws editable before schedule generation", () => {
    const events = guideEvents();
    expect(events).toHaveLength(7);
    expect(events.flatMap((d) => d.teams)).toHaveLength(80);
    expect(
      events.flatMap((d) => d.teams.flatMap((t) => t.players)),
    ).toHaveLength(139);
    expect(events.flatMap((d) => d.matches)).toHaveLength(0);
    expect(events.flatMap((d) => poolSchedule(d, 4))).toHaveLength(132);
    expect(events.find((d) => d.id === "ocs")?.config.quarterRules).toEqual({
      target: 15,
      margin: 2,
      bestOf: 1,
    });
  });
});
