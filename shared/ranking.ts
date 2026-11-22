// Rule sources: 2026 USA Pickleball Official Rulebook, 15.B.4–6, 15.C.1,
// https://usapickleball.org/docs/rules/USAP-Official-Rulebook.pdf?court=2026
// El Nido Pickleball Open 2026 Tournament Format Guide, sections 3–5.
export type Policy = "local" | "official";
export interface StandingMatch {
  a: string;
  b: string;
  winner: string;
  games: [number, number][];
}
export interface Standing {
  id: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  tied: boolean;
  reason: string;
}
interface Options {
  unequal?: boolean;
  order?: string[];
  higher?: string[];
  /** Official 15.B.4.a. An administrator has confirmed exclusion for the event. */
  excluded?: string[];
}

export function validateRules(
  target: number,
  margin: number,
  bestOf: number,
  phase: "pool" | "playoff",
  poolSize: number,
  official: boolean,
  afterNonPoolRoundRobin = false,
): void {
  if (
    ![11, 15, 21].includes(target) ||
    ![1, 3, 5].includes(bestOf) ||
    ![1, 2].includes(margin)
  )
    throw new Error(
      "Choose a target of 11, 15 or 21, a winning margin of 1 or 2 and a match length of 1, 3 or 5 games.",
    );
  if (!official) return;
  if (margin !== 2)
    throw new Error(
      "The 2026 standard scoring preset requires a two-point winning margin.",
    );
  if (bestOf > 1 && target !== 11)
    throw new Error("Standard multi-game matches use games to 11.");
  if (bestOf === 1 && target === 11 && (phase !== "pool" || poolSize < 6))
    throw new Error(
      "A single standard game to 11 requires a round robin with at least six entries.",
    );
  if (phase === "playoff" && afterNonPoolRoundRobin && bestOf === 5)
    throw new Error(
      "A playoff following non-pool round robin uses best of three to 11 or one game to 15 or 21.",
    );
}

function blank(id: string): Standing {
  return {
    id,
    rank: 0,
    played: 0,
    wins: 0,
    losses: 0,
    gamesWon: 0,
    gamesLost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    diff: 0,
    tied: false,
    reason: "",
  };
}

function stats(
  id: string,
  matches: StandingMatch[],
  opponents?: Set<string>,
): Standing {
  const row = blank(id);
  for (const match of matches) {
    const side = match.a === id ? 0 : match.b === id ? 1 : -1;
    if (
      side < 0 ||
      (opponents && !opponents.has(side === 0 ? match.b : match.a))
    )
      continue;
    row.played++;
    if (match.winner === id) row.wins++;
    else row.losses++;
    for (const game of match.games) {
      const [scored, allowed] = side === 0 ? game : [game[1], game[0]];
      row.pointsFor += scored;
      row.pointsAgainst += allowed;
      if (scored > allowed) row.gamesWon++;
      else if (scored < allowed) row.gamesLost++;
    }
  }
  row.diff = row.pointsFor - row.pointsAgainst;
  return row;
}

type Group = Standing[];
type Values = (group: Group) => number[] | undefined;
type Criterion = [string, Values];
const proportion = (n: number, d: number) => (d ? n / d : 0);
const field =
  (key: "wins" | "diff" | "pointsFor"): Values =>
  (group) =>
    group.map((row) => row[key]);

/** Supply authoritative confirmed pool matches, including opponents outside the candidate set
 * when comparing wild cards. Team IDs only provide a stable display order inside unresolved ties. */
export function rank(
  ids: string[],
  matches: StandingMatch[],
  policy: Policy,
  options: Options = {},
): Standing[] {
  const excluded = new Set(options.excluded);
  const confirmed = matches.filter(
    (m) =>
      (m.winner === m.a || m.winner === m.b) &&
      m.a !== m.b &&
      !excluded.has(m.a) &&
      !excluded.has(m.b),
  );
  const rows = [...new Set(ids)]
    .filter((id) => !excluded.has(id))
    .sort()
    .map((id) => stats(id, confirmed));
  const opponentsMetric = (
    group: Group,
    opponents: Set<string>,
    key: "wins" | "diff",
  ) => {
    const subset = group.map((row) => stats(row.id, confirmed, opponents));
    if (
      !subset[0].played ||
      subset.some((row) => row.played !== subset[0].played)
    )
      return;
    return subset.map((row) => row[key]);
  };
  // Head-to-head values apply to the teams tied on match wins. Later official criteria
  // continue to compare that cohort's games, even when only a subset is still level.
  const officialCohort = (group: Group) =>
    new Set(rows.filter((r) => r.wins === group[0].wins).map((r) => r.id));
  const headToHead =
    (key: "wins" | "diff"): Values =>
    (group) =>
      opponentsMetric(group, officialCohort(group), key);
  const nextTeam: Values = (group) => {
    let next = options.higher;
    if (!next) {
      const other = rows.filter((row) => row.wins !== group[0].wins);
      const totals = [...new Set(other.map((r) => r.wins))];
      const above = totals.filter((n) => n > group[0].wins);
      const nextWins = above.length ? Math.min(...above) : Math.max(...totals);
      next = other.filter((r) => r.wins === nextWins).map((r) => r.id);
    }
    // The rule specifies one next-ranked opponent. Ambiguous reference teams need review.
    if (next.length !== 1) return;
    return opponentsMetric(group, new Set(next), "diff");
  };
  const local: Criterion[] = [
    [
      "Match win percentage",
      (group) => group.map((r) => proportion(r.wins, r.played)),
    ],
    [
      "Points won percentage",
      (group) =>
        group.map((r) =>
          proportion(r.pointsFor, r.pointsFor + r.pointsAgainst),
        ),
    ],
    [
      "Head-to-head result",
      (group) =>
        group.length === 2
          ? opponentsMetric(group, new Set(group.map((r) => r.id)), "wins")
          : undefined,
    ],
  ];
  const official: Criterion[] = [
    ["Matches won", field("wins")],
    ["Head-to-head record", headToHead("wins")],
    [
      "Overall point differential",
      (group) => (options.unequal ? undefined : field("diff")(group)),
    ],
    ["Head-to-head point differential", headToHead("diff")],
    ["Point differential against the next-ranked opponent", nextTeam],
    [
      "Total points scored",
      (group) => (options.unequal ? undefined : field("pointsFor")(group)),
    ],
  ];
  const criteria = policy === "local" ? local : official;
  criteria.push([
    "Recorded administrator decision",
    (group) => {
      const order = options.order ?? [];
      if (
        new Set(order).size !== order.length ||
        !group.every((r) => order.includes(r.id))
      )
        return;
      return group.map((r) => -order.indexOf(r.id));
    },
  ]);
  function resolve(
    group: Group,
    position: number,
    index: number,
    reason: string,
  ): Group {
    if (group.length === 1) return [{ ...group[0], rank: position, reason }];
    if (index >= criteria.length)
      return group.map((row) => ({
        ...row,
        rank: position,
        tied: true,
        reason:
          policy === "local" && group.length === 2
            ? "Tied · record coin toss"
            : "Tied · administrator decision required",
      }));
    const [label, evaluate] = criteria[index];
    const values = evaluate(group);
    if (!values || values.every((n) => n === values[0]))
      return resolve(group, position, index + 1, reason);
    const buckets = new Map<number, Group>();
    group.forEach((r, i) => {
      const key = values[i];
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(r);
    });
    return [...buckets.entries()]
      .sort(([a], [b]) => b - a)
      .flatMap(([, bucket]) => {
        const result = resolve(bucket, position, index + 1, label);
        position += bucket.length;
        return result;
      });
  }
  return rows.length ? resolve(rows, 1, 0, "Only entry") : [];
}
