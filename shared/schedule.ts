export interface GuideDivision {
  code: string;
  name: string;
  sizes: number[];
  qualifiersPerPool: number;
  wildcards: number;
  doubleThree: boolean;
  type: "singles" | "doubles";
}

/** El Nido Pickleball Open 2026, Tournament Format & Competition Structure, pp. 1–2. */
export const guideDivisions: GuideDivision[] = [
  {
    code: "OCS",
    name: "Open Combined Singles",
    sizes: [4, 4, 4, 4, 5],
    qualifiersPerPool: 1,
    wildcards: 3,
    doubleThree: false,
    type: "singles",
  },
  {
    code: "NX",
    name: "Novice Mixed Doubles",
    sizes: [4, 4, 4],
    qualifiersPerPool: 1,
    wildcards: 1,
    doubleThree: false,
    type: "doubles",
  },
  {
    code: "NM",
    name: "Novice Men’s Doubles",
    sizes: [4, 4, 3],
    qualifiersPerPool: 1,
    wildcards: 1,
    doubleThree: true,
    type: "doubles",
  },
  {
    code: "BX",
    name: "Beginner Mixed Doubles",
    sizes: [4, 4, 3],
    qualifiersPerPool: 1,
    wildcards: 1,
    doubleThree: true,
    type: "doubles",
  },
  {
    code: "BM",
    name: "Beginner Men’s Doubles",
    sizes: [4, 4, 3],
    qualifiersPerPool: 1,
    wildcards: 1,
    doubleThree: true,
    type: "doubles",
  },
  {
    code: "BW",
    name: "Beginner Women’s Doubles",
    sizes: [5, 4],
    qualifiersPerPool: 2,
    wildcards: 0,
    doubleThree: false,
    type: "doubles",
  },
  {
    code: "NW",
    name: "Novice Women’s Doubles",
    sizes: [5],
    qualifiersPerPool: 4,
    wildcards: 0,
    doubleThree: false,
    type: "doubles",
  },
];

export interface ScheduledPair {
  a: string;
  b: string;
  pool: number;
  slot: number;
  court: number;
}

function uniqueTeams(teams: string[]) {
  if (teams.some((id) => !id.trim()) || new Set(teams).size !== teams.length) {
    throw new Error("Team IDs must be nonempty and unique within the event.");
  }
}

function poolRounds(
  teams: string[],
  doubleThree: boolean,
): [string, string][][] {
  if (teams.length < 2) return [];
  const ring = teams.slice();
  if (ring.length % 2) ring.push("");
  const rounds: [string, string][][] = [];
  for (let round = 0; round < ring.length - 1; round++) {
    const pairs: [string, string][] = [];
    for (let left = 0; left < ring.length / 2; left++) {
      const right = ring.length - 1 - left;
      if (ring[left] && ring[right]) pairs.push([ring[left], ring[right]]);
    }
    rounds.push(pairs);
    ring.splice(1, 0, ring.pop()!);
  }
  if (doubleThree && teams.length === 3) {
    return [
      ...rounds,
      ...rounds.map((pairs) => pairs.map(([a, b]): [string, string] => [b, a])),
    ];
  }
  return rounds;
}

/** Equal-length slots. Allocate every draw round before advancing to the next one. */
export function schedule(
  pools: string[][],
  courtCount: number,
  doubleThree = false,
): ScheduledPair[] {
  if (!Number.isSafeInteger(courtCount) || courtCount < 1)
    throw new Error("Add at least one court.");
  uniqueTeams(pools.flat());
  const rounds = pools.map((pool) => poolRounds(pool, doubleThree));
  const result: ScheduledPair[] = [];
  let slot = 0;
  for (let round = 0; rounds.some((pool) => round < pool.length); round++) {
    let assigned = 0;
    for (const [pool, draw] of rounds.entries()) {
      for (const [a, b] of draw[round] ?? []) {
        result.push({
          a,
          b,
          pool,
          court: assigned % courtCount,
          slot: slot + Math.floor(assigned / courtCount),
        });
        assigned++;
      }
    }
    slot += Math.ceil(assigned / courtCount);
  }
  return result;
}

export interface BracketMatch {
  id: string;
  a: string;
  b: string;
  fromA: string;
  fromB: string;
  round: number;
}

/** Seeds arrive in ranked order. For a two-pool crossover supply [A1,B1,A2,B2]. */
export function bracket(seeds: string[]): BracketMatch[] {
  uniqueTeams(seeds);
  if (seeds.length < 2) return [];
  let positions = [1, 2];
  while (positions.length < seeds.length) {
    const size = positions.length * 2;
    positions = positions.flatMap((seed) => [seed, size + 1 - seed]);
  }
  type Source = { team: string; from: string } | undefined;
  let sources: Source[] = positions.map((seed) =>
    seeds[seed - 1] ? { team: seeds[seed - 1], from: "" } : undefined,
  );
  const matches: BracketMatch[] = [];
  for (let round = 0; sources.length > 1; round++) {
    const next: Source[] = [];
    for (let i = 0; i < sources.length; i += 2) {
      const a = sources[i];
      const b = sources[i + 1];
      if (!a || !b) {
        next.push(a ?? b);
        continue;
      }
      const id = "K" + (matches.length + 1);
      matches.push({
        id,
        round,
        a: a.team,
        b: b.team,
        fromA: a.from,
        fromB: b.from,
      });
      next.push({ team: "", from: id });
    }
    sources = next;
  }
  return matches;
}
