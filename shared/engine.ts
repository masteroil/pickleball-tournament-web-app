import {
  check,
  clean,
  integer,
  gameWinner,
  gamesWon,
  matchWinner,
  type Match,
  type Tournament,
  type Division,
  type Staff,
  type Action,
  type Config,
  type Rules,
  type Team,
  type Pair,
} from "./model";
import { schedule, bracket } from "./schedule";
import { rank, validateRules } from "./ranking";
export function validateConfig(c: Config) {
  clean(c.name);
  check(
    ["hybrid", "round-robin", "elimination"].includes(c.format) &&
      ["local", "official"].includes(c.policy) &&
      ["singles", "doubles"].includes(c.type),
    "Invalid event format",
  );
  check(
    Array.isArray(c.sizes) && c.sizes.length > 0 && c.sizes.length <= 12,
    "Choose 1–12 pools",
  );
  c.sizes.forEach((n) => integer(n, 2, 32));
  check(
    c.sizes.reduce((a, b) => a + b, 0) <= 64,
    "Maximum 64 entries per division",
  );
  integer(c.advance, 1, Math.min(...c.sizes));
  integer(c.wildcards, 0, c.sizes.length);
  check(
    !c.wildcards || c.advance < Math.min(...c.sizes),
    "Wild cards need an eligible next place",
  );
  for (const [stage, r] of [
    ["pool", c.poolRules],
    ["playoff", c.playoffRules],
    ...(c.quarterRules ? [["playoff", c.quarterRules]] : []),
  ] as ["pool" | "playoff", Rules][]) {
    if (
      (c.format === "elimination" && stage === "pool") ||
      (c.format === "round-robin" && stage === "playoff")
    )
      continue;
    validateRules(
      r.target,
      r.margin,
      r.bestOf,
      stage,
      Math.min(...c.sizes),
      c.policy === "official",
      c.format === "hybrid" && c.sizes.length === 1,
    );
  }
}
export function newDivision(
  id: string,
  config: Config,
  teams: Team[],
): Division {
  validateConfig(config);
  check(
    teams.length === config.sizes.reduce((a, b) => a + b, 0),
    "Entry count must match the draw",
  );
  check(
    new Set(teams.map((t) => t.id)).size === teams.length,
    "Duplicate entry ID",
  );
  for (const t of teams) {
    clean(t.id);
    clean(t.name);
    integer(t.pool, 0, config.sizes.length - 1);
    check(
      t.players.length === (config.type === "singles" ? 1 : 2),
      "Enter every player name",
    );
    t.players.forEach((p) => clean(p));
  }
  config.sizes.forEach((n, i) =>
    check(teams.filter((t) => t.pool === i).length === n, "Pool size mismatch"),
  );
  return {
    id,
    config,
    teams,
    matches: [],
    review: false,
    orders: {},
    revision: 0,
    published: true,
  };
}
const base = (rules: Rules): Match => ({
  id: "",
  phase: "pool",
  pool: 0,
  round: 0,
  a: "",
  b: "",
  fromA: "",
  fromB: "",
  slot: 0,
  court: 0,
  ref: "",
  rules,
  games: [[0, 0]],
  status: "scheduled",
  winner: "",
  version: 0,
  started: 0,
  updated: 0,
  finished: 0,
  confirmedBy: "",
  undo: [],
  reason: "",
});
export function poolSchedule(d: Division, courts: number) {
  return schedule(
    d.config.sizes.map((_, i) =>
      d.teams.filter((t) => t.pool === i).map((t) => t.id),
    ),
    courts,
    d.config.doubleThree,
  ).map((p, i) => ({ ...base(d.config.poolRules), ...p, id: "P" + (i + 1) }));
}
const confirmed = (d: Division) =>
  d.matches.filter((m) => m.phase === "pool" && m.status === "final");
export function table(d: Division, pool: number) {
  return rank(
    d.teams.filter((t) => t.pool === pool).map((t) => t.id),
    confirmed(d).filter((m) => m.pool === pool),
    d.config.policy,
    { order: d.orders["p" + pool] },
  );
}
export function qualifiers(d: Division) {
  if (d.config.format === "elimination") return d.teams.map((t) => t.id);
  check(
    d.matches.some((m) => m.phase === "pool") &&
      d.matches
        .filter((m) => m.phase === "pool")
        .every((m) => m.status === "final"),
    "Confirm every pool match first",
  );
  const tables = d.config.sizes.map((_, i) => table(d, i));
  const result: string[] = [];
  for (let i = 0; i < d.config.advance + (d.config.wildcards ? 1 : 0); i++) {
    const group = tables.map((rows) => {
      check(!rows[i].tied, "Resolve pool ties before seeding");
      return rows[i].id;
    });
    if (d.config.wildcards) {
      const key = "seed" + i;
      const rows = rank(group, confirmed(d), d.config.policy, {
        unequal: new Set(d.config.sizes).size > 1,
        order: d.orders[key],
      });
      const count = i === d.config.advance ? d.config.wildcards : group.length;
      check(
        rows.slice(0, count).every((r) => !r.tied),
        "Resolve cross-pool seed ties before seeding (" + key + ")",
      );
      result.push(...rows.slice(0, count).map((r) => r.id));
    } else result.push(...group);
  }
  return result;
}
export function playoffs(d: Division, courts: number, seeds = qualifiers(d)) {
  check(seeds.length >= 2, "At least two qualifiers required");
  const tree = bracket(seeds);
  let slot =
    Math.max(
      -1,
      ...d.matches.filter((m) => m.phase === "pool").map((m) => m.slot),
    ) + 1;
  let previous = -1,
    count = 0;
  const maxRound = Math.max(...tree.map((x) => x.round));
  return tree.map((x) => {
    if (x.round !== previous) {
      if (previous >= 0) slot += Math.ceil(count / courts);
      previous = x.round;
      count = 0;
    }
    const rules =
      x.round === maxRound - 2 && d.config.quarterRules
        ? d.config.quarterRules
        : d.config.playoffRules;
    return {
      ...base(rules),
      ...x,
      phase: "playoff" as const,
      pool: -1,
      slot: slot + Math.floor(count / courts),
      court: count++ % courts,
    };
  });
}
export function apply(
  d: Division,
  t: Tournament,
  actor: Staff,
  action: Action,
  now: number,
) {
  const { kind, data = {} } = action;
  const m = d.matches.find((v) => v.id === action.match);
  const admin = actor.role === "admin";
  const score = [
    "start",
    "point",
    "subtract",
    "undo",
    "next",
    "confirm",
    "incident",
  ].includes(kind);
  check(
    admin || (score && actor.role === "referee" && m?.ref === actor.uid),
    "Permission denied",
  );
  check(
    action.expected === (m ? m.version : d.revision),
    "Conflict: reload the latest result",
  );
  if (score || ["reopen", "assign", "correct"].includes(kind))
    check(m, "Unknown match");
  if (m?.status === "reopened") check(admin, "Permission denied");
  if (score && m?.status !== "reopened") {
    check(!t.paused, "Tournament is paused");
    check(
      m!.phase !== "playoff" || !d.review,
      "Bracket needs administrator review",
    );
  }
  const before = m ? structuredClone(m.games) : [];
  if (kind === "generate") {
    check(!d.matches.length, "Schedule already exists");
    d.matches =
      d.config.format === "elimination"
        ? playoffs(d, t.courts.length)
        : poolSchedule(d, t.courts.length);
  } else if (kind === "playoffs") {
    check(d.config.format === "hybrid", "This event has no pool playoffs");
    check(
      !d.matches.some((x) => x.phase === "playoff" && x.started),
      "Playoffs already started",
    );
    const generated = playoffs(d, t.courts.length);
    d.matches = [...d.matches.filter((x) => x.phase === "pool"), ...generated];
    d.review = false;
  } else if (kind === "acceptBracket") {
    check(d.review && clean(data.reason), "Explain the review decision");
    d.review = false;
  } else if (kind === "publish") {
    check(typeof data.value === "boolean", "Invalid publication setting");
    d.published = data.value;
  } else if (kind === "order") {
    const ids = data.ids;
    check(
      Array.isArray(ids) &&
        ids.length &&
        new Set(ids).size === ids.length &&
        ids.every((i) => d.teams.some((t) => t.id === i)),
      "Invalid tie resolution",
    );
    check(/^(p|seed)\d+$/.test(data.key), "Unknown ranking group");
    clean(data.reason);
    d.orders[data.key] = ids;
    if (d.matches.some((x) => x.phase === "playoff")) d.review = true;
  } else if (kind === "teams") {
    check(!d.matches.length, "Pool draw is locked once scheduled");
    d.teams = newDivision(d.id, d.config, data.teams).teams;
  } else if (m) {
    if (kind === "assign") {
      check(m.status === "scheduled", "Only scheduled matches can be moved");
      const court = integer(data.court, 0, t.courts.length - 1),
        slot = integer(data.slot, 0, 2000);
      check(
        !d.matches.some(
          (x) =>
            x.id !== m.id &&
            x.slot === slot &&
            (x.court === court ||
              [m.a, m.b].some((id) => id && (x.a === id || x.b === id)) ||
              (data.ref && x.ref === data.ref)),
        ),
        "Time slot conflicts with another assignment",
      );
      check(
        typeof data.ref === "string" && data.ref.length <= 128,
        "Invalid referee",
      );
      Object.assign(m, { court, slot, ref: data.ref });
    } else if (kind === "start") {
      check(m.status === "scheduled" && m.a && m.b, "Match is not ready");
      check(
        !d.matches.some(
          (x) =>
            x.status === "live" &&
            (x.court === m.court ||
              [m.a, m.b].some((id) => x.a === id || x.b === id) ||
              (m.ref && x.ref === m.ref)),
        ),
        "Court, team or referee already playing",
      );
      m.status = "live";
      m.started = now;
    } else if (kind === "reopen") {
      check(
        ["review", "final"].includes(m.status),
        "Only finalized or flagged matches can reopen",
      );
      for (const next of d.matches.filter(
        (x) => !x.started && (x.fromA === m.id || x.fromB === m.id),
      )) {
        if (next.fromA === m.id) next.a = "";
        if (next.fromB === m.id) next.b = "";
        next.version++;
      }
      m.reason = clean(data.reason, 300);
      m.status = "reopened";
      m.winner = "";
      m.confirmedBy = "";
      m.finished = 0;
      d.orders = {};
      if (d.matches.some((x) => x.phase === "playoff")) d.review = true;
    } else if (kind === "incident") {
      check(m.status === "live", "Start the match first");
      m.reason = clean(data.reason, 300);
      m.status = "review";
    } else {
      check(
        m.status === "live" ||
          (m.status === "reopened" && ["confirm", "correct"].includes(kind)),
        "Match must be live or under administrator correction",
      );
      if (kind === "confirm") {
        const w = matchWinner(m);
        check(w, "A valid winning score is required");
        m.winner = w;
        m.status = "final";
        m.finished = now;
        m.confirmedBy = actor.uid;
        m.undo = [];
        for (const next of d.matches.filter(
          (x) => x.fromA === m.id || x.fromB === m.id,
        )) {
          if (next.started) {
            d.review = true;
            continue;
          }
          if (next.fromA === m.id) next.a = w;
          else next.b = w;
          next.version++;
        }
      } else if (kind === "undo") {
        check(m.undo.length, "No recent action to undo");
        m.games = m.undo.pop()!;
      } else {
        const last = m.games.at(-1)!;
        const old = structuredClone(m.games);
        if (kind === "next") {
          check(
            gameWinner(last, m.rules) >= 0 && !matchWinner(m),
            "Next game is unavailable",
          );
          m.games.push([0, 0]);
        } else if (kind === "point" || kind === "subtract") {
          const side = integer(data.side, 0, 1) as 0 | 1;
          if (kind === "point")
            check(gameWinner(last, m.rules) < 0, "Game already complete");
          else check(last[side] > 0, "Score is already zero");
          last[side] += kind === "point" ? 1 : -1;
        } else if (kind === "correct") {
          clean(data.reason, 300);
          check(
            Array.isArray(data.games) &&
              data.games.length >= 1 &&
              data.games.length <= m.rules.bestOf,
            "Invalid game count",
          );
          const copy: Pair[] = [];
          for (const v of data.games) {
            check(Array.isArray(v) && v.length === 2, "Invalid score pair");
            const g: Pair = [integer(v[0], 0, 999), integer(v[1], 0, 999)];
            const w = gameWinner(g, m.rules);
            if (w >= 0)
              check(
                Math.max(...g) ===
                  Math.max(m.rules.target, Math.min(...g) + m.rules.margin),
                "Game continued after winning point",
              );
            if (copy.length)
              check(
                gameWinner(copy.at(-1)!, m.rules) >= 0 &&
                  !matchWinner({ ...m, games: copy }),
                "Previous game incomplete or match already won",
              );
            copy.push(g);
          }
          m.games = copy;
        } else throw Error("Unknown command");
        m.undo = [...m.undo.slice(-9), old];
      }
    }
    m.version++;
    m.updated = now;
  } else throw Error("Unknown command");
  d.revision++;
  return {
    id: action.requestId,
    match: m?.id || "",
    kind,
    by: actor.uid,
    time: now,
    before,
    after: m ? structuredClone(m.games) : [],
    reason: String(data.reason || "").slice(0, 300),
  };
}
