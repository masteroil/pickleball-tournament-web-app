import { newDivision, playoffs, poolSchedule } from "./engine";
import { guideDivisions } from "./schedule";
import type { Config, Division, Team, Tournament } from "./model";

/** Fictional practice tournament, deliberately separate from Firebase accounts and events. */
export const demoTournament: Tournament = {
  id: "demo",
  name: "El Nido Pickleball Open",
  venue: "El Nido Pickle Park",
  location: "El Nido, Palawan",
  date: "2026-12-04",
  timezone: "Asia/Manila",
  organizer: "El Nido Tournament Desk",
  courts: ["Court 1", "Court 2", "Court 3", "Court 4"],
  visible: true,
  paused: false,
  owner: "admin",
};

export const defaultConfig: Config = {
  name: "Mixed Doubles",
  type: "doubles",
  format: "hybrid",
  sizes: [4, 4],
  advance: 2,
  wildcards: 0,
  policy: "local",
  doubleThree: false,
  poolRules: { target: 15, margin: 2, bestOf: 1 },
  playoffRules: { target: 11, margin: 2, bestOf: 3 },
};

const pairs = [
  ["Bacuit Breakers", "Lia Reyes", "Noel Ramos"],
  ["Cadlao Crew", "Maya Cruz", "Leo Fabian"],
  ["Corong Aces", "Nina Soriano", "Jules Tan"],
  ["Lio Palms", "Inez Garcia", "Marco Peña"],
  ["Nacpan Waves", "Bea Santos", "Ben Tejada"],
  ["Taraw Titans", "Alix Flores", "Joey Lim"],
  ["Marimegmeg Rally", "Pia Navarro", "Kyle Dizon"],
  ["Pangulasian Pair", "Ana Rojas", "Miko Velez"],
];

export function demoDivision(): Division {
  const teams = pairs.map(([name, ...players], i) => ({
    id: "team-" + (i + 1),
    name,
    players,
    pool: Math.floor(i / 4),
  }));
  const division = newDivision("mixed", structuredClone(defaultConfig), teams);
  division.matches = poolSchedule(division, demoTournament.courts.length);

  // Static local times make seed imports and demos reproducible.
  const start = Date.parse("2026-12-04T09:00:00+08:00");
  const minute = 60_000;
  const results: [number, number][] = [
    [15, 9],
    [12, 15],
    [15, 11],
    [15, 6],
  ];
  for (const [index, match] of division.matches.entries()) {
    // Two assigned mobile referees can work distinct courts in each time block.
    match.ref = ["referee", "referee2", "", ""][match.court];
    if (index < results.length) {
      match.games = [results[index]];
      match.status = "final";
      match.winner = match.games[0][0] > match.games[0][1] ? match.a : match.b;
      match.started = start;
      match.finished = match.updated = start + (16 + index) * minute;
      match.version = 1;
      match.confirmedBy = match.ref || "admin";
    } else if (index === 4 || index === 5) {
      match.games = [index === 4 ? [8, 6] : [5, 7]];
      match.status = "live";
      match.started = start + 25 * minute;
      match.updated = start + 31 * minute;
      match.version = 1;
    }
  }

  // Show the structure while keeping every qualifying slot undecided until official seeding.
  const preview = playoffs(division, 4, ["A1", "B1", "A2", "B2"]);
  preview.forEach((m) => {
    m.a = "";
    m.b = "";
  });
  division.matches.push(...preview);
  return division;
}

/** The published guide has sizes and format only. Names are editable draw slots. */
export function guideEvents(): Division[] {
  return guideDivisions.map((d) => {
    const config: Config = {
      ...structuredClone(defaultConfig),
      name: d.name,
      type: d.type,
      sizes: [...d.sizes],
      advance: d.qualifiersPerPool,
      wildcards: d.wildcards,
      doubleThree: d.doubleThree,
      ...(d.code === "OCS"
        ? { quarterRules: { target: 15, margin: 2, bestOf: 1 } }
        : {}),
    };
    const teams: Team[] = d.sizes.flatMap((size, pool) =>
      Array.from({ length: size }, (_, i) => {
        const slot = String.fromCharCode(65 + pool) + (i + 1);
        const label = d.code + " " + slot;
        return {
          id: d.code + "-" + slot,
          pool,
          name: "Draw " + slot,
          players:
            config.type === "singles"
              ? ["Player " + label]
              : ["Player " + label + "-1", "Player " + label + "-2"],
        };
      }),
    );
    return newDivision(d.code.toLowerCase(), config, teams);
  });
}
