export type Rules = { target: number; margin: number; bestOf: number };
export type Pair = [number, number];
export type Team = {
  id: string;
  name: string;
  players: string[];
  pool: number;
};
export type Match = {
  id: string;
  phase: "pool" | "playoff";
  pool: number;
  round: number;
  a: string;
  b: string;
  fromA: string;
  fromB: string;
  slot: number;
  court: number;
  ref: string;
  rules: Rules;
  games: Pair[];
  status: "scheduled" | "live" | "final" | "review" | "reopened";
  winner: string;
  version: number;
  started: number;
  updated: number;
  finished: number;
  confirmedBy: string;
  undo: Pair[][];
  reason: string;
};
export type Config = {
  name: string;
  type: "singles" | "doubles";
  format: "hybrid" | "round-robin" | "elimination";
  sizes: number[];
  advance: number;
  wildcards: number;
  policy: "local" | "official";
  doubleThree: boolean;
  poolRules: Rules;
  playoffRules: Rules;
  quarterRules?: Rules;
};
export type Division = {
  id: string;
  config: Config;
  teams: Team[];
  matches: Match[];
  review: boolean;
  orders: Record<string, string[]>;
  revision: number;
  published: boolean;
};
export type Tournament = {
  id: string;
  name: string;
  venue: string;
  location: string;
  date: string;
  timezone: string;
  organizer: string;
  courts: string[];
  visible: boolean;
  paused: boolean;
  owner: string;
};
export type Staff = { uid: string; role: "admin" | "referee" | "spectator" };
export type Action = {
  kind: string;
  requestId: string;
  expected: number;
  match?: string;
  data?: any;
};
export type Audit = {
  id: string;
  match: string;
  kind: string;
  by: string;
  time: number;
  before: Pair[];
  after: Pair[];
  reason: string;
};
export const check: (
  condition: unknown,
  message: string,
) => asserts condition = (c, m) => {
  if (!c) throw new Error(m);
};
export function gameWinner([a, b]: Pair, r: Rules) {
  return Math.max(a, b) >= r.target && Math.abs(a - b) >= r.margin
    ? a > b
      ? 0
      : 1
    : -1;
}
export function gamesWon(m: Pick<Match, "games" | "rules">): Pair {
  const wins: Pair = [0, 0];
  for (const game of m.games) {
    const side = gameWinner(game, m.rules);
    if (side === 0 || side === 1) wins[side]++;
  }
  return wins;
}
export function matchWinner(m: Match) {
  const [a, b] = gamesWon(m);
  return a > m.rules.bestOf / 2 ? m.a : b > m.rules.bestOf / 2 ? m.b : "";
}
export const clean = (v: unknown, limit = 100) => {
  check(
    typeof v === "string" && v.trim().length > 0 && v.trim().length <= limit,
    "Enter a valid text value",
  );
  return v.trim();
};
export const integer = (v: unknown, min: number, max: number) => {
  check(
    typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max,
    "Number outside the allowed range",
  );
  return v;
};
