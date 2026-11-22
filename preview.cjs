"use strict";

// scripts/preview.ts
var import_node_http = require("node:http");
var import_node_fs2 = require("node:fs");
var import_node_path = require("node:path");

// scripts/demo.ts
var import_node_fs = require("node:fs");
var import_node_crypto = require("node:crypto");

// shared/model.ts
var check = (c, m) => {
  if (!c) throw new Error(m);
};
function gameWinner([a, b], r) {
  return Math.max(a, b) >= r.target && Math.abs(a - b) >= r.margin ? a > b ? 0 : 1 : -1;
}
function gamesWon(m) {
  const wins = [0, 0];
  for (const game of m.games) {
    const side = gameWinner(game, m.rules);
    if (side === 0 || side === 1) wins[side]++;
  }
  return wins;
}
function matchWinner(m) {
  const [a, b] = gamesWon(m);
  return a > m.rules.bestOf / 2 ? m.a : b > m.rules.bestOf / 2 ? m.b : "";
}
var clean = (v, limit = 100) => {
  check(
    typeof v === "string" && v.trim().length > 0 && v.trim().length <= limit,
    "Enter a valid text value"
  );
  return v.trim();
};
var integer = (v, min, max) => {
  check(
    typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max,
    "Number outside the allowed range"
  );
  return v;
};

// shared/schedule.ts
function uniqueTeams(teams) {
  if (teams.some((id) => !id.trim()) || new Set(teams).size !== teams.length) {
    throw new Error("Team IDs must be nonempty and unique within the event.");
  }
}
function poolRounds(teams, doubleThree) {
  if (teams.length < 2) return [];
  const ring = teams.slice();
  if (ring.length % 2) ring.push("");
  const rounds = [];
  for (let round = 0; round < ring.length - 1; round++) {
    const pairs2 = [];
    for (let left = 0; left < ring.length / 2; left++) {
      const right = ring.length - 1 - left;
      if (ring[left] && ring[right]) pairs2.push([ring[left], ring[right]]);
    }
    rounds.push(pairs2);
    ring.splice(1, 0, ring.pop());
  }
  if (doubleThree && teams.length === 3) {
    return [
      ...rounds,
      ...rounds.map((pairs2) => pairs2.map(([a, b]) => [b, a]))
    ];
  }
  return rounds;
}
function schedule(pools, courtCount, doubleThree = false) {
  if (!Number.isSafeInteger(courtCount) || courtCount < 1)
    throw new Error("Add at least one court.");
  uniqueTeams(pools.flat());
  const rounds = pools.map((pool) => poolRounds(pool, doubleThree));
  const result = [];
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
          slot: slot + Math.floor(assigned / courtCount)
        });
        assigned++;
      }
    }
    slot += Math.ceil(assigned / courtCount);
  }
  return result;
}
function bracket(seeds) {
  uniqueTeams(seeds);
  if (seeds.length < 2) return [];
  let positions = [1, 2];
  while (positions.length < seeds.length) {
    const size = positions.length * 2;
    positions = positions.flatMap((seed) => [seed, size + 1 - seed]);
  }
  let sources = positions.map(
    (seed) => seeds[seed - 1] ? { team: seeds[seed - 1], from: "" } : void 0
  );
  const matches = [];
  for (let round = 0; sources.length > 1; round++) {
    const next = [];
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
        fromB: b.from
      });
      next.push({ team: "", from: id });
    }
    sources = next;
  }
  return matches;
}

// shared/ranking.ts
function validateRules(target, margin, bestOf, phase, poolSize, official, afterNonPoolRoundRobin = false) {
  if (![11, 15, 21].includes(target) || ![1, 3, 5].includes(bestOf) || ![1, 2].includes(margin))
    throw new Error(
      "Choose a target of 11, 15 or 21, a winning margin of 1 or 2 and a match length of 1, 3 or 5 games."
    );
  if (!official) return;
  if (margin !== 2)
    throw new Error(
      "The 2026 standard scoring preset requires a two-point winning margin."
    );
  if (bestOf > 1 && target !== 11)
    throw new Error("Standard multi-game matches use games to 11.");
  if (bestOf === 1 && target === 11 && (phase !== "pool" || poolSize < 6))
    throw new Error(
      "A single standard game to 11 requires a round robin with at least six entries."
    );
  if (phase === "playoff" && afterNonPoolRoundRobin && bestOf === 5)
    throw new Error(
      "A playoff following non-pool round robin uses best of three to 11 or one game to 15 or 21."
    );
}
function blank(id) {
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
    reason: ""
  };
}
function stats(id, matches, opponents) {
  const row = blank(id);
  for (const match of matches) {
    const side = match.a === id ? 0 : match.b === id ? 1 : -1;
    if (side < 0 || opponents && !opponents.has(side === 0 ? match.b : match.a))
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
var proportion = (n, d) => d ? n / d : 0;
var field = (key) => (group) => group.map((row) => row[key]);
function rank(ids, matches, policy, options = {}) {
  const excluded = new Set(options.excluded);
  const confirmed2 = matches.filter(
    (m) => (m.winner === m.a || m.winner === m.b) && m.a !== m.b && !excluded.has(m.a) && !excluded.has(m.b)
  );
  const rows = [...new Set(ids)].filter((id) => !excluded.has(id)).sort().map((id) => stats(id, confirmed2));
  const opponentsMetric = (group, opponents, key) => {
    const subset = group.map((row) => stats(row.id, confirmed2, opponents));
    if (!subset[0].played || subset.some((row) => row.played !== subset[0].played))
      return;
    return subset.map((row) => row[key]);
  };
  const officialCohort = (group) => new Set(rows.filter((r) => r.wins === group[0].wins).map((r) => r.id));
  const headToHead = (key) => (group) => opponentsMetric(group, officialCohort(group), key);
  const nextTeam = (group) => {
    let next = options.higher;
    if (!next) {
      const other = rows.filter((row) => row.wins !== group[0].wins);
      const totals = [...new Set(other.map((r) => r.wins))];
      const above = totals.filter((n) => n > group[0].wins);
      const nextWins = above.length ? Math.min(...above) : Math.max(...totals);
      next = other.filter((r) => r.wins === nextWins).map((r) => r.id);
    }
    if (next.length !== 1) return;
    return opponentsMetric(group, new Set(next), "diff");
  };
  const local = [
    [
      "Match win percentage",
      (group) => group.map((r) => proportion(r.wins, r.played))
    ],
    [
      "Points won percentage",
      (group) => group.map(
        (r) => proportion(r.pointsFor, r.pointsFor + r.pointsAgainst)
      )
    ],
    [
      "Head-to-head result",
      (group) => group.length === 2 ? opponentsMetric(group, new Set(group.map((r) => r.id)), "wins") : void 0
    ]
  ];
  const official = [
    ["Matches won", field("wins")],
    ["Head-to-head record", headToHead("wins")],
    [
      "Overall point differential",
      (group) => options.unequal ? void 0 : field("diff")(group)
    ],
    ["Head-to-head point differential", headToHead("diff")],
    ["Point differential against the next-ranked opponent", nextTeam],
    [
      "Total points scored",
      (group) => options.unequal ? void 0 : field("pointsFor")(group)
    ]
  ];
  const criteria = policy === "local" ? local : official;
  criteria.push([
    "Recorded administrator decision",
    (group) => {
      const order = options.order ?? [];
      if (new Set(order).size !== order.length || !group.every((r) => order.includes(r.id)))
        return;
      return group.map((r) => -order.indexOf(r.id));
    }
  ]);
  function resolve2(group, position, index, reason) {
    if (group.length === 1) return [{ ...group[0], rank: position, reason }];
    if (index >= criteria.length)
      return group.map((row) => ({
        ...row,
        rank: position,
        tied: true,
        reason: policy === "local" && group.length === 2 ? "Tied \xB7 record coin toss" : "Tied \xB7 administrator decision required"
      }));
    const [label, evaluate] = criteria[index];
    const values = evaluate(group);
    if (!values || values.every((n) => n === values[0]))
      return resolve2(group, position, index + 1, reason);
    const buckets = /* @__PURE__ */ new Map();
    group.forEach((r, i) => {
      const key = values[i];
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(r);
    });
    return [...buckets.entries()].sort(([a], [b]) => b - a).flatMap(([, bucket]) => {
      const result = resolve2(bucket, position, index + 1, label);
      position += bucket.length;
      return result;
    });
  }
  return rows.length ? resolve2(rows, 1, 0, "Only entry") : [];
}

// shared/engine.ts
function validateConfig(c) {
  clean(c.name);
  check(
    ["hybrid", "round-robin", "elimination"].includes(c.format) && ["local", "official"].includes(c.policy) && ["singles", "doubles"].includes(c.type),
    "Invalid event format"
  );
  check(
    Array.isArray(c.sizes) && c.sizes.length > 0 && c.sizes.length <= 12,
    "Choose 1\u201312 pools"
  );
  c.sizes.forEach((n) => integer(n, 2, 32));
  check(
    c.sizes.reduce((a, b) => a + b, 0) <= 64,
    "Maximum 64 entries per division"
  );
  integer(c.advance, 1, Math.min(...c.sizes));
  integer(c.wildcards, 0, c.sizes.length);
  check(
    !c.wildcards || c.advance < Math.min(...c.sizes),
    "Wild cards need an eligible next place"
  );
  for (const [stage, r] of [
    ["pool", c.poolRules],
    ["playoff", c.playoffRules],
    ...c.quarterRules ? [["playoff", c.quarterRules]] : []
  ]) {
    if (c.format === "elimination" && stage === "pool" || c.format === "round-robin" && stage === "playoff")
      continue;
    validateRules(
      r.target,
      r.margin,
      r.bestOf,
      stage,
      Math.min(...c.sizes),
      c.policy === "official",
      c.format === "hybrid" && c.sizes.length === 1
    );
  }
}
function newDivision(id, config, teams) {
  validateConfig(config);
  check(
    teams.length === config.sizes.reduce((a, b) => a + b, 0),
    "Entry count must match the draw"
  );
  check(
    new Set(teams.map((t) => t.id)).size === teams.length,
    "Duplicate entry ID"
  );
  for (const t of teams) {
    clean(t.id);
    clean(t.name);
    integer(t.pool, 0, config.sizes.length - 1);
    check(
      t.players.length === (config.type === "singles" ? 1 : 2),
      "Enter every player name"
    );
    t.players.forEach((p) => clean(p));
  }
  config.sizes.forEach(
    (n, i) => check(teams.filter((t) => t.pool === i).length === n, "Pool size mismatch")
  );
  return {
    id,
    config,
    teams,
    matches: [],
    review: false,
    orders: {},
    revision: 0,
    published: true
  };
}
var base = (rules) => ({
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
  reason: ""
});
function poolSchedule(d, courts) {
  return schedule(
    d.config.sizes.map(
      (_, i) => d.teams.filter((t) => t.pool === i).map((t) => t.id)
    ),
    courts,
    d.config.doubleThree
  ).map((p, i) => ({ ...base(d.config.poolRules), ...p, id: "P" + (i + 1) }));
}
var confirmed = (d) => d.matches.filter((m) => m.phase === "pool" && m.status === "final");
function table(d, pool) {
  return rank(
    d.teams.filter((t) => t.pool === pool).map((t) => t.id),
    confirmed(d).filter((m) => m.pool === pool),
    d.config.policy,
    { order: d.orders["p" + pool] }
  );
}
function qualifiers(d) {
  if (d.config.format === "elimination") return d.teams.map((t) => t.id);
  check(
    d.matches.some((m) => m.phase === "pool") && d.matches.filter((m) => m.phase === "pool").every((m) => m.status === "final"),
    "Confirm every pool match first"
  );
  const tables = d.config.sizes.map((_, i) => table(d, i));
  const result = [];
  for (let i = 0; i < d.config.advance + (d.config.wildcards ? 1 : 0); i++) {
    const group = tables.map((rows) => {
      check(!rows[i].tied, "Resolve pool ties before seeding");
      return rows[i].id;
    });
    if (d.config.wildcards) {
      const key = "seed" + i;
      const rows = rank(group, confirmed(d), d.config.policy, {
        unequal: new Set(d.config.sizes).size > 1,
        order: d.orders[key]
      });
      const count = i === d.config.advance ? d.config.wildcards : group.length;
      check(
        rows.slice(0, count).every((r) => !r.tied),
        "Resolve cross-pool seed ties before seeding (" + key + ")"
      );
      result.push(...rows.slice(0, count).map((r) => r.id));
    } else result.push(...group);
  }
  return result;
}
function playoffs(d, courts, seeds = qualifiers(d)) {
  check(seeds.length >= 2, "At least two qualifiers required");
  const tree = bracket(seeds);
  let slot = Math.max(
    -1,
    ...d.matches.filter((m) => m.phase === "pool").map((m) => m.slot)
  ) + 1;
  let previous = -1, count = 0;
  const maxRound = Math.max(...tree.map((x) => x.round));
  return tree.map((x) => {
    if (x.round !== previous) {
      if (previous >= 0) slot += Math.ceil(count / courts);
      previous = x.round;
      count = 0;
    }
    const rules = x.round === maxRound - 2 && d.config.quarterRules ? d.config.quarterRules : d.config.playoffRules;
    return {
      ...base(rules),
      ...x,
      phase: "playoff",
      pool: -1,
      slot: slot + Math.floor(count / courts),
      court: count++ % courts
    };
  });
}
function apply(d, t, actor, action, now) {
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
    "incident"
  ].includes(kind);
  check(
    admin || score && actor.role === "referee" && m?.ref === actor.uid,
    "Permission denied"
  );
  check(
    action.expected === (m ? m.version : d.revision),
    "Conflict: reload the latest result"
  );
  if (score || ["reopen", "assign", "correct"].includes(kind))
    check(m, "Unknown match");
  if (m?.status === "reopened") check(admin, "Permission denied");
  if (score && m?.status !== "reopened") {
    check(!t.paused, "Tournament is paused");
    check(
      m.phase !== "playoff" || !d.review,
      "Bracket needs administrator review"
    );
  }
  const before = m ? structuredClone(m.games) : [];
  if (kind === "generate") {
    check(!d.matches.length, "Schedule already exists");
    d.matches = d.config.format === "elimination" ? playoffs(d, t.courts.length) : poolSchedule(d, t.courts.length);
  } else if (kind === "playoffs") {
    check(d.config.format === "hybrid", "This event has no pool playoffs");
    check(
      !d.matches.some((x) => x.phase === "playoff" && x.started),
      "Playoffs already started"
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
      Array.isArray(ids) && ids.length && new Set(ids).size === ids.length && ids.every((i) => d.teams.some((t2) => t2.id === i)),
      "Invalid tie resolution"
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
      const court = integer(data.court, 0, t.courts.length - 1), slot = integer(data.slot, 0, 2e3);
      check(
        !d.matches.some(
          (x) => x.id !== m.id && x.slot === slot && (x.court === court || [m.a, m.b].some((id) => id && (x.a === id || x.b === id)) || data.ref && x.ref === data.ref)
        ),
        "Time slot conflicts with another assignment"
      );
      check(
        typeof data.ref === "string" && data.ref.length <= 128,
        "Invalid referee"
      );
      Object.assign(m, { court, slot, ref: data.ref });
    } else if (kind === "start") {
      check(m.status === "scheduled" && m.a && m.b, "Match is not ready");
      check(
        !d.matches.some(
          (x) => x.status === "live" && (x.court === m.court || [m.a, m.b].some((id) => x.a === id || x.b === id) || m.ref && x.ref === m.ref)
        ),
        "Court, team or referee already playing"
      );
      m.status = "live";
      m.started = now;
    } else if (kind === "reopen") {
      check(
        ["review", "final"].includes(m.status),
        "Only finalized or flagged matches can reopen"
      );
      for (const next of d.matches.filter(
        (x) => !x.started && (x.fromA === m.id || x.fromB === m.id)
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
        m.status === "live" || m.status === "reopened" && ["confirm", "correct"].includes(kind),
        "Match must be live or under administrator correction"
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
          (x) => x.fromA === m.id || x.fromB === m.id
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
        m.games = m.undo.pop();
      } else {
        const last = m.games.at(-1);
        const old = structuredClone(m.games);
        if (kind === "next") {
          check(
            gameWinner(last, m.rules) >= 0 && !matchWinner(m),
            "Next game is unavailable"
          );
          m.games.push([0, 0]);
        } else if (kind === "point" || kind === "subtract") {
          const side = integer(data.side, 0, 1);
          if (kind === "point")
            check(gameWinner(last, m.rules) < 0, "Game already complete");
          else check(last[side] > 0, "Score is already zero");
          last[side] += kind === "point" ? 1 : -1;
        } else if (kind === "correct") {
          clean(data.reason, 300);
          check(
            Array.isArray(data.games) && data.games.length >= 1 && data.games.length <= m.rules.bestOf,
            "Invalid game count"
          );
          const copy = [];
          for (const v of data.games) {
            check(Array.isArray(v) && v.length === 2, "Invalid score pair");
            const g = [integer(v[0], 0, 999), integer(v[1], 0, 999)];
            const w = gameWinner(g, m.rules);
            if (w >= 0)
              check(
                Math.max(...g) === Math.max(m.rules.target, Math.min(...g) + m.rules.margin),
                "Game continued after winning point"
              );
            if (copy.length)
              check(
                gameWinner(copy.at(-1), m.rules) >= 0 && !matchWinner({ ...m, games: copy }),
                "Previous game incomplete or match already won"
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
    reason: String(data.reason || "").slice(0, 300)
  };
}

// shared/seed.ts
var demoTournament = {
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
  owner: "admin"
};
var defaultConfig = {
  name: "Mixed Doubles",
  type: "doubles",
  format: "hybrid",
  sizes: [4, 4],
  advance: 2,
  wildcards: 0,
  policy: "local",
  doubleThree: false,
  poolRules: { target: 15, margin: 2, bestOf: 1 },
  playoffRules: { target: 11, margin: 2, bestOf: 3 }
};
var pairs = [
  ["Bacuit Breakers", "Lia Reyes", "Noel Ramos"],
  ["Cadlao Crew", "Maya Cruz", "Leo Fabian"],
  ["Corong Aces", "Nina Soriano", "Jules Tan"],
  ["Lio Palms", "Inez Garcia", "Marco Pe\xF1a"],
  ["Nacpan Waves", "Bea Santos", "Ben Tejada"],
  ["Taraw Titans", "Alix Flores", "Joey Lim"],
  ["Marimegmeg Rally", "Pia Navarro", "Kyle Dizon"],
  ["Pangulasian Pair", "Ana Rojas", "Miko Velez"]
];
function demoDivision() {
  const teams = pairs.map(([name, ...players], i) => ({
    id: "team-" + (i + 1),
    name,
    players,
    pool: Math.floor(i / 4)
  }));
  const division2 = newDivision("mixed", structuredClone(defaultConfig), teams);
  division2.matches = poolSchedule(division2, demoTournament.courts.length);
  const start = Date.parse("2026-12-04T09:00:00+08:00");
  const minute = 6e4;
  const results = [
    [15, 9],
    [12, 15],
    [15, 11],
    [15, 6]
  ];
  for (const [index, match] of division2.matches.entries()) {
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
  const preview = playoffs(division2, 4, ["A1", "B1", "A2", "B2"]);
  preview.forEach((m) => {
    m.a = "";
    m.b = "";
  });
  division2.matches.push(...preview);
  return division2;
}

// shared/service.ts
function tournament(id, uid, raw) {
  const { name, venue, location, date, timezone, organizer } = raw;
  for (const v of [name, venue, location, date, timezone, organizer]) clean(v);
  check(
    /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)),
    "Invalid date"
  );
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  check(
    Array.isArray(raw.courts) && raw.courts.length > 0 && raw.courts.length <= 32,
    "Choose 1\u201332 courts"
  );
  const courts = raw.courts.map((v) => clean(v));
  check(new Set(courts).size === courts.length, "Court names must be unique");
  return {
    id,
    owner: uid,
    name,
    venue,
    location,
    date,
    timezone,
    organizer,
    courts,
    paused: raw.paused === true,
    visible: raw.visible === true
  };
}
function division(id, data) {
  return newDivision(id, data.config, data.teams);
}
function mutate(d, t, others, actor, act, now) {
  const audit = apply(d, t, actor, act, now);
  const occupied = others.flatMap((v) => v.matches);
  const collides = (a, b) => a.court === b.court || Boolean(a.ref && a.ref === b.ref);
  if (["generate", "playoffs"].includes(act.kind)) {
    const generated = d.matches.filter(
      (m) => act.kind === "generate" || m.phase === "playoff"
    );
    if (generated.length) {
      const first = Math.min(...generated.map((m) => m.slot));
      const offset = Math.max(
        0,
        Math.max(-1, ...occupied.map((m) => m.slot)) + 1 - first
      );
      generated.forEach((m) => m.slot += offset);
    }
  } else if (act.kind === "assign" || act.kind === "start") {
    const m = d.matches.find((x) => x.id === act.match);
    check(
      !occupied.some(
        (x) => collides(x, m) && (act.kind === "assign" ? x.slot === m.slot : x.status === "live")
      ),
      "Court or referee conflict in another division"
    );
  }
  check(
    JSON.stringify(d).length < 7e5,
    "Division exceeds the supported event size"
  );
  return audit;
}
function additionalDivisions(first, additional = []) {
  check(
    Array.isArray(additional) && additional.length <= 11,
    "Too many divisions"
  );
  const ids = /* @__PURE__ */ new Set([first]);
  return additional.map((item) => {
    check(
      typeof item.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(item.id) && !ids.has(item.id),
      "Invalid or duplicate division ID"
    );
    ids.add(item.id);
    return division(item.id, item);
  });
}

// scripts/demo.ts
function localDemo() {
  const file = process.env.DEMO_FILE || ".demo-state.json";
  let state = (0, import_node_fs.existsSync)(file) ? JSON.parse((0, import_node_fs.readFileSync)(file, "utf8")) : {
    records: {
      [demoTournament.id]: {
        t: demoTournament,
        events: [demoDivision()],
        staff: { admin: "admin", referee: "referee", referee2: "referee" },
        history: {}
      }
    },
    requests: {}
  };
  const sessions = /* @__PURE__ */ new Map();
  const clients = /* @__PURE__ */ new Set();
  const handler2 = async (req, res, next) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (!url.pathname.startsWith("/demo/")) return next();
    const uid = sessions.get(
      String(
        req.headers.authorization || url.searchParams.get("token") || ""
      )
    ) || "";
    const send = (v) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(v));
    };
    try {
      if (url.pathname === "/demo/stream") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache"
        });
        const ping = () => res.write("data: update\n\n");
        clients.add(ping);
        ping();
        const timer = setInterval(() => res.write(": keepalive\n\n"), 15e3);
        req.on("close", () => {
          clearInterval(timer);
          clients.delete(ping);
        });
        return;
      }
      if (url.pathname === "/demo/read") {
        const tid = url.searchParams.get("tid") || demoTournament.id;
        const r2 = state.records[tid];
        const catalog = Object.values(state.records).filter(
          (r3) => r3.t.visible || ["admin", "referee"].includes(r3.staff[uid])
        ).map((r3) => r3.t);
        const allowed = r2 && (r2.t.visible || ["admin", "referee"].includes(r2.staff[uid]));
        return send({
          catalog,
          t: allowed ? r2.t : null,
          events: allowed ? r2.events : [],
          role: allowed ? r2.staff[uid] || "spectator" : "spectator",
          uid,
          history: allowed && ["admin", "referee"].includes(r2.staff[uid]) ? r2.history : {}
        });
      }
      check(req.method === "POST", "Use POST");
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        check(body.length < 5e5, "Request too large");
      }
      const p = JSON.parse(body);
      if (url.pathname === "/demo/login") {
        const who = String(p.email).split("@")[0];
        check(
          ["admin", "referee", "referee2"].includes(who) && p.email === who + "@demo.test" && p.password === "Courtside26!",
          "Invalid demo login"
        );
        const token = (0, import_node_crypto.randomUUID)();
        sessions.set(token, who);
        return send({ token, uid: who });
      }
      if (url.pathname === "/demo/logout") {
        sessions.delete(String(req.headers.authorization));
        return send({ ok: true });
      }
      check(uid, "Sign in first");
      check(
        /^[\w-]{1,128}$/.test(p.tid) && /^[\w-]{1,128}$/.test(p.eid) && /^[\w-]{1,128}$/.test(p.requestId),
        "Invalid ID"
      );
      const id = uid + "/" + p.tid + "/" + p.requestId;
      const sig = JSON.stringify(p);
      if (state.requests[id]) {
        check(state.requests[id] === sig, "Request ID reused");
        return send({ ok: true });
      }
      const draft = structuredClone(state), r = draft.records[p.tid], mode = p.mode;
      if (mode === "create") {
        check(!r, "Duplicate tournament");
        draft.records[p.tid] = {
          t: tournament(p.tid, uid, p.tournament),
          events: [
            division(p.eid, p.division),
            ...additionalDivisions(p.eid, p.additional)
          ],
          staff: { [uid]: "admin" },
          history: {}
        };
      } else {
        check(r, "Unknown tournament");
        const role = r.staff[uid] || "spectator";
        if (mode === "action") {
          const d = r.events.find((e) => e.id === p.eid);
          check(d, "Unknown division");
          const ev = mutate(
            d,
            r.t,
            r.events.filter((e) => e !== d),
            { uid, role },
            p.action,
            Date.now()
          );
          (r.history[d.id] ??= []).push(ev);
        } else {
          check(role === "admin", "Permission denied");
          if (mode === "settings") {
            const t = tournament(p.tid, r.t.owner, { ...r.t, ...p.settings });
            check(t.courts.length >= r.t.courts.length, "Cannot remove courts");
            r.t = t;
          } else if (mode === "staff") {
            check(
              p.uid !== r.t.owner && ["referee", "spectator"].includes(p.role),
              "Invalid role"
            );
            r.staff[p.uid] = p.role;
          } else if (mode === "division") {
            check(!r.events.some((d) => d.id === p.eid), "Duplicate division");
            const ds = [
              division(p.eid, p.division),
              ...additionalDivisions(p.eid, p.additional)
            ];
            check(
              !ds.some((v) => r.events.some((e) => v.id === e.id)),
              "Duplicate division"
            );
            r.events.push(...ds);
          } else throw Error("Unknown operation");
        }
      }
      draft.requests[id] = sig;
      (0, import_node_fs.writeFileSync)(file + ".tmp", JSON.stringify(draft));
      (0, import_node_fs.renameSync)(file + ".tmp", file);
      state = draft;
      const committed = r?.events.find((v) => v.id === p.eid)?.matches.find((m) => m.id === p.action?.match);
      send({ ok: true, match: JSON.stringify(committed || null) });
      clients.forEach((f) => f());
    } catch (e) {
      res.statusCode = 400;
      send({ error: e instanceof Error ? e.message : "Invalid request" });
    }
  };
  return {
    name: "isolated-local-demo",
    configureServer(s) {
      s.middlewares.use(handler2);
    },
    configurePreviewServer(s) {
      s.middlewares.use(handler2);
    }
  };
}

// scripts/preview.ts
var root = (0, import_node_path.resolve)(__dirname, "dist");
if (!(0, import_node_fs2.existsSync)((0, import_node_path.resolve)(root, "index.html")))
  throw Error("Build the application before starting the preview.");
var mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};
var plugin = localDemo();
var handler = (0, import_node_http.createServer)();
var configure = plugin.configurePreviewServer;
configure({
  middlewares: {
    use: (middleware) => handler.on("request", (req, res) => {
      middleware(req, res, () => {
        try {
          const pathname = decodeURIComponent(
            new URL(req.url || "/", "http://localhost").pathname
          );
          const file = (0, import_node_path.resolve)(
            root,
            "." + (pathname === "/" ? "/index.html" : pathname)
          );
          if (!file.startsWith(root + import_node_path.sep) || !(0, import_node_fs2.existsSync)(file) || !(0, import_node_fs2.statSync)(file).isFile()) {
            res.writeHead(404);
            return res.end();
          }
          res.setHeader(
            "Content-Type",
            mime[(0, import_node_path.extname)(file)] || "application/octet-stream"
          );
          (0, import_node_fs2.createReadStream)(file).on("error", () => res.destroy()).pipe(res);
        } catch {
          res.writeHead(400);
          res.end();
        }
      });
    })
  }
});
var port = Number(process.env.PORT || 4173);
handler.listen(
  port,
  "127.0.0.1",
  () => console.log(
    "Pickleball Tournament Live demo: http://127.0.0.1:" + port + "/"
  )
);
