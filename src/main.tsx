import { requestId as newId } from "./ids";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QRCodeSVG } from "qrcode.react";
import { firebaseMode, empty, login, logout, watch, write } from "./gateway";
import {
  gameWinner,
  gamesWon,
  matchWinner,
  type Match,
  type Division,
  type Tournament,
} from "../shared/model";
import { table } from "../shared/engine";
import { Field, Wizard, TeamEditor, pool, type Run } from "./forms";
import "./style.css";
const uuid = () => newId();
function go(page: string, t: string, e: string, m = "") {
  location.hash = [page, t, e, m].map(encodeURIComponent).join("/");
}
function useRoute() {
  const read = () => location.hash.slice(1).split("/").map(decodeURIComponent);
  const [r, set] = useState(read);
  useEffect(() => {
    const f = () => set(read());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return r;
}
function App() {
  const [page = "live", tid = firebaseMode ? "" : "demo", eid = "", mid = ""] =
    useRoute().map((v) => v || undefined);
  const [s, set] = useState(empty),
    [link, net] = useState("Connecting"),
    [feedback, msg] = useState(""),
    [busy, save] = useState(false),
    [offline, off] = useState(!navigator.onLine);
  useEffect(() => watch(tid, set, net), [tid]);
  useEffect(() => {
    msg("");
    window.scrollTo(0, 0);
  }, [page, tid, eid, mid]);
  useEffect(() => {
    const f = () => off(!navigator.onLine);
    window.addEventListener("offline", f);
    window.addEventListener("online", f);
    return () => {
      window.removeEventListener("offline", f);
      window.removeEventListener("online", f);
    };
  }, []);
  const t = s.t,
    d = s.events.find((v) => v.id === eid) || s.events[0],
    m = d?.matches.find((v) => v.id === mid);
  const nav = (p: string, id = "") => go(p, t?.id || tid, d?.id || eid, id);
  const admin = s.role === "admin",
    staff = admin || s.role === "referee";
  const run: Run = async (fn) => {
    if (busy) return false;
    save(true);
    try {
      await fn();
      msg("Saved");
      return true;
    } catch (e) {
      msg((e as Error).message);
      return false;
    } finally {
      save(false);
    }
  };
  const send = (mode: string, extra: any) =>
    run(async () => {
      const result = await write({
        mode,
        tid: t?.id,
        eid: d?.id || "main",
        ...extra,
      });
      const committed: Match | null = result?.match
        ? JSON.parse(result.match)
        : null;
      if (committed)
        set((prev) =>
          prev.t?.id !== t?.id
            ? prev
            : {
                ...prev,
                events: prev.events.map((event) =>
                  event.id !== d?.id
                    ? event
                    : {
                        ...event,
                        matches: event.matches.map((m) =>
                          m.id === committed.id && m.version < committed.version
                            ? committed
                            : m,
                        ),
                      },
                ),
              },
        );
    });
  const action = (kind: string, data: any = {}, match?: Match) => {
    const requestId = uuid();
    return send("action", {
      requestId,
      action: {
        kind,
        data,
        requestId,
        expected: match ? match.version : d?.revision,
        ...(match ? { match: match.id } : {}),
      },
    });
  };
  const names = (id: string) =>
    d?.teams.find((x) => x.id === id)?.name || "To be decided";
  const tv = page === "tv";
  const conn =
    offline || link === "Offline" ? "Offline" : busy ? "Saving" : link;
  async function make(raw: any, ds: Division[]) {
    const adding = page === "newdivision";
    const id = adding ? t!.id : uuid();
    const ok = await run(() =>
      write({
        mode: adding ? "division" : "create",
        tid: id,
        eid: ds[0].id,
        tournament: raw,
        division: ds[0],
        additional: ds.slice(1),
      }),
    );
    if (!ok) return false;
    go("admin", id, ds[0].id);
    return true;
  }
  const publicPages = [
    ["live", "Live courts"],
    ["schedule", "Schedule"],
    ["standings", "Standings"],
    ["bracket", "Playoffs"],
  ];
  const tournamentMatches = s.events
    .flatMap((event) => event.matches.map((match) => ({ event, match })))
    .sort((a, b) => a.match.slot - b.match.slot);
  const stats = {
    live: tournamentMatches.filter((x) => x.match.status === "live").length,
    final: tournamentMatches.filter((x) => x.match.status === "final").length,
  };
  const time = (n: number) =>
    n
      ? new Intl.DateTimeFormat("en-PH", {
          timeZone: t?.timezone,
          hour: "numeric",
          minute: "2-digit",
        }).format(n)
      : "—";
  function tile(c: number) {
    const matches = tournamentMatches.filter((x) => x.match.court === c);
    const current =
      matches.find((x) => x.match.status === "live") ||
      matches.find(
        (x) => x.match.status === "scheduled" && x.match.a && x.match.b,
      ) ||
      matches.filter((x) => x.match.status === "final").at(-1);
    const x = current?.match;
    const event = current?.event;
    return (
      <article key={c} className="court">
        <div className="courthead">
          <div className="courtno">
            <span className="courticon" /> {t!.courts[c]}
          </div>
          <Status value={x?.status || "idle"} />
        </div>
        {x ? (
          <>
            <small>
              {s.events.length > 1 ? event?.config.name + " · " : ""}
              {x.phase === "pool" ? pool(x.pool) : "Knockout"} · Match {x.id} ·
              Game {x.games.length}
            </small>
            {[x.a, x.b].map((id, i) => (
              <div className="scoreline" key={i}>
                <strong>
                  {event?.teams.find((team) => team.id === id)?.name}
                </strong>
                <b>{x.games.at(-1)![i]}</b>
              </div>
            ))}
            <div className="courtfoot">
              <span>
                Games {gamesWon(x).join("–")} · {time(x.updated)}
              </span>
              <button onClick={() => go("match", tid, event!.id, x.id)}>
                Match details
              </button>
            </div>
          </>
        ) : (
          <p>Awaiting assignment</p>
        )}
      </article>
    );
  }
  return (
    <div className={tv ? "app tv" : "app"}>
      <header>
        <div className="bar">
          <button className="brand" onClick={() => nav("live")}>
            <span className="mark">P</span>
            <span>
              Pickleball <b>Live</b>
            </span>
          </button>
          <div className="headeractions">
            {!firebaseMode && <span className="demo">Local demo</span>}
            <span
              className={"connection " + (conn === "Offline" ? "warn" : "")}
            >
              {conn}
            </span>
            {s.uid ? (
              <button onClick={() => run(() => logout())}>Sign out</button>
            ) : (
              <button onClick={() => nav("signin")}>Staff sign in</button>
            )}
          </div>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="eyebrow">
            {t?.venue || "Tournament center"}
            {t ? " / " + t.location : ""}
          </div>
          <h1>{t?.name || "Tournament center"}</h1>
          <div className="herometa">
            {t && (
              <>
                <span>
                  {new Intl.DateTimeFormat("en-PH", {
                    dateStyle: "long",
                    timeZone: "UTC",
                  }).format(new Date(t.date + "T00:00:00Z"))}
                </span>
                <span>{t.courts.length} courts</span>
                <span>{t.paused ? "Operations paused" : d?.config.name}</span>
              </>
            )}
          </div>
          <div className="courtart" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </section>
        {!tv && (
          <>
            <div className="selectors">
              {s.catalog.length > 0 && (
                <Field label="Tournament">
                  <select
                    value={t?.id || ""}
                    onChange={(e) => go("live", e.target.value, "")}
                  >
                    {!t && <option value="">Choose a tournament</option>}
                    {s.catalog.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {s.events.length > 1 && (
                <Field label="Division">
                  <select
                    value={d?.id}
                    onChange={(e) => go("live", tid, e.target.value)}
                  >
                    {s.events.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.config.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {s.uid && (
                <button onClick={() => nav("new")}>Create tournament</button>
              )}
            </div>
            <nav>
              {[
                ...publicPages,
                ...(staff ? [["ref", "Referee desk"]] : []),
                ...(admin ? [["admin", "Manage"]] : []),
              ].map(([p, l]) => (
                <button
                  key={p}
                  className={p === page ? "selected" : ""}
                  onClick={() => nav(p)}
                >
                  {l}
                </button>
              ))}
            </nav>
          </>
        )}
        {feedback && (
          <div
            role="status"
            className={feedback === "Saved" ? "notice" : "notice error"}
          >
            {feedback}
            {feedback.includes("Conflict")
              ? " · Review the latest score before retrying."
              : ""}
          </div>
        )}
        {page === "signin" ? (
          <SignIn run={run} done={() => nav("ref")} />
        ) : (page === "new" && s.uid) || (page === "newdivision" && admin) ? (
          <Wizard
            key={page}
            existing={page === "newdivision" ? t! : undefined}
            save={make}
          />
        ) : !t || !d ? (
          <div className="panel">
            <h2>
              {link === "Connecting"
                ? "Loading courts…"
                : "Choose a tournament"}
            </h2>
            <p>Open a public tournament link or sign in to create an event.</p>
          </div>
        ) : (
          <>
            {["live", "tv", "court"].includes(page) && (
              <>
                <div className="sectionhead">
                  <div>
                    <div className="eyebrow">
                      {s.events.length > 1 ? "All divisions" : d.config.name} /
                      Scoreboard
                    </div>
                    <h2>
                      {page === "court" ? t.courts[Number(mid)] : "Live courts"}
                    </h2>
                  </div>
                  <div className="actions">
                    <button
                      onClick={() => {
                        nav(tv ? "live" : "tv");
                        if (!tv)
                          document.documentElement
                            .requestFullscreen?.()
                            .catch(() => {});
                        else if (document.fullscreenElement)
                          document.exitFullscreen();
                      }}
                    >
                      {tv ? "Exit TV" : "TV mode"}
                    </button>
                    {!tv && (
                      <button onClick={() => nav("share")}>QR codes</button>
                    )}
                  </div>
                </div>
                <div className="stats">
                  <span>
                    <b>{stats!.live}</b> Live now
                  </span>
                  <span>
                    <b>{stats!.final}</b> Completed
                  </span>
                  <span>
                    <b>{s.events.reduce((n, e) => n + e.teams.length, 0)}</b>{" "}
                    Entries
                  </span>
                </div>
                <div className="courtgrid">
                  {t.courts.map((_, i) =>
                    page !== "court" || i === Number(mid) ? tile(i) : null,
                  )}
                </div>
              </>
            )}
            {["schedule", "ref"].includes(page) && (
              <>
                <div className="sectionhead">
                  <h2>{page === "ref" ? "Referee desk" : "Match schedule"}</h2>
                  <span>{t.timezone}</span>
                </div>
                {page === "ref" && !staff ? (
                  <button onClick={() => nav("signin")}>
                    Sign in as referee
                  </button>
                ) : (
                  <MatchList
                    list={d.matches.filter(
                      (x) => page !== "ref" || admin || x.ref === s.uid,
                    )}
                    t={t}
                    names={names}
                    open={(id) => nav("match", id)}
                    admin={admin}
                    action={action}
                  />
                )}
              </>
            )}
            {page === "standings" && (
              <>
                <h2>Pool standings</h2>
                {d.published || staff ? (
                  d.config.sizes.map((_, i) => (
                    <section className="panel" key={i}>
                      <h3>{pool(i)}</h3>
                      <div className="scroll">
                        <table>
                          <thead>
                            <tr>
                              {[
                                "Rank",
                                "Entry",
                                "Played",
                                "W",
                                "L",
                                "Games W–L",
                                "Points for",
                                "Against",
                                "+/−",
                                "Qualification",
                                "Ranking basis",
                              ].map((x) => (
                                <th key={x}>{x}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {table(d, i).map((r) => (
                              <tr key={r.id}>
                                <td>{r.rank}</td>
                                <th>{names(r.id)}</th>
                                <td>{r.played}</td>
                                <td>{r.wins}</td>
                                <td>{r.losses}</td>
                                <td>
                                  {r.gamesWon}–{r.gamesLost}
                                </td>
                                <td>{r.pointsFor}</td>
                                <td>{r.pointsAgainst}</td>
                                <td>{r.diff}</td>
                                <td>
                                  {r.tied
                                    ? "Tied"
                                    : d.config.format === "round-robin"
                                      ? "—"
                                      : r.rank <= d.config.advance
                                        ? d.matches.some(
                                            (m) =>
                                              m.phase === "pool" &&
                                              m.status !== "final",
                                          )
                                          ? "In position"
                                          : "Qualified"
                                        : "—"}
                                </td>
                                <td>{r.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))
                ) : (
                  <p>Standings await publication.</p>
                )}
              </>
            )}
            {page === "bracket" && (
              <>
                <h2>Playoff bracket</h2>
                {d.review && (
                  <p className="notice error">
                    A corrected result requires administrator review.
                  </p>
                )}
                <div className="rounds">
                  {Array.from(
                    new Set(
                      d.matches
                        .filter((m) => m.phase === "playoff")
                        .map((m) => m.round),
                    ),
                  ).map((r, _, rounds) => (
                    <section key={r}>
                      <h3>
                        {r === rounds.at(-1)
                          ? "Championship"
                          : r === rounds.at(-2)
                            ? "Semifinals"
                            : "Round " + (r + 1)}
                      </h3>
                      {d.matches
                        .filter((m) => m.phase === "playoff" && m.round === r)
                        .map((x) => (
                          <button
                            className="bracketcard"
                            key={x.id}
                            onClick={() => nav("match", x.id)}
                          >
                            <small>
                              Match {x.id} · {x.status}
                            </small>
                            <strong>
                              {x.a
                                ? names(x.a)
                                : x.fromA
                                  ? "Winner of " + x.fromA
                                  : "Pending qualifier"}
                            </strong>
                            <strong>
                              {x.b
                                ? names(x.b)
                                : x.fromB
                                  ? "Winner of " + x.fromB
                                  : "Pending qualifier"}
                            </strong>
                            {x.winner && (
                              <b>
                                {r === rounds.at(-1) ? "Champion" : "Winner"} ·{" "}
                                {names(x.winner)}
                              </b>
                            )}
                          </button>
                        ))}
                    </section>
                  ))}
                </div>
                {!d.matches.some((m) => m.phase === "playoff") && (
                  <p>Playoff matchups appear after seeding.</p>
                )}
              </>
            )}
            {page === "match" && m && (
              <Scoring
                key={m.id}
                {...{ t, d, m, names, action, admin }}
                edit={admin || (s.role === "referee" && s.uid === m.ref)}
                blocked={offline || link !== "Connected" || busy}
                history={(s.history[d.id] || []).filter(
                  (a) => a.match === m.id,
                )}
              />
            )}
            {page === "admin" && admin && (
              <Admin key={d.id} {...{ t, d, action, send, nav }} />
            )}
            {page === "share" && (
              <>
                <h2>Tournament QR codes</h2>
                <div className="courtgrid">
                  {["Tournament", ...t.courts].map((label, i) => {
                    const u =
                      location.href.split("#")[0] +
                      "#" +
                      (i ? "court" : "live") +
                      "/" +
                      tid +
                      "/" +
                      d.id +
                      (i ? "/" + (i - 1) : "");
                    return (
                      <div className="panel" key={label}>
                        <h3>{label}</h3>
                        <QRCodeSVG value={u} size={144} />
                        <p>
                          <a href={u}>Open scoreboard</a>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </main>
      <footer>
        Pickleball Tournament Live <span>·</span>{" "}
        {t?.organizer || "Tournament operations"}
      </footer>
    </div>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={"status " + value}>
      {value === "live" ? "● Live" : value === "scheduled" ? "Upcoming" : value}
    </span>
  );
}
function SignIn({ run, done }: { run: Run; done: () => void }) {
  const [email, em] = useState(""),
    [password, pw] = useState("");
  return (
    <form
      className="form panel narrow"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => login(email, password))) done();
      }}
    >
      <div className="eyebrow">Tournament staff</div>
      <h2>Sign in</h2>
      <Field label="Email">
        <input
          autoComplete="username"
          type="email"
          required
          value={email}
          onChange={(e) => em(e.target.value)}
        />
      </Field>
      <Field label="Password">
        <input
          autoComplete="current-password"
          type="password"
          required
          value={password}
          onChange={(e) => pw(e.target.value)}
        />
      </Field>
      <button className="primary">Sign in</button>
      {!firebaseMode && (
        <div className="demologin">
          <small>Practice accounts</small>
          {["admin", "referee", "referee2"].map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                em(a + "@demo.test");
                pw("Courtside26!");
              }}
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
type ActionFn = (kind: string, data?: any, m?: Match) => Promise<boolean>;
type Names = (id: string) => string;
function slotTime(t: Tournament, n: number) {
  const dt = new Date(t.date + "T09:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + Math.floor(n / 16));
  dt.setUTCMinutes(dt.getUTCMinutes() + (n % 16) * 30);
  return dt.toISOString().slice(5, 16).replace("T", " ");
}
function MatchList({
  list,
  t,
  names,
  open,
  admin,
  action,
}: {
  list: Match[];
  t: Tournament;
  names: Names;
  open: (id: string) => void;
  admin: boolean;
  action: ActionFn;
}) {
  const [edit, set] = useState("");
  return (
    <div className="panel">
      {!list.length && <p>No matches assigned yet.</p>}
      {[...list]
        .sort((a, b) => a.slot - b.slot)
        .map((x) => (
          <div key={x.id}>
            <div className="matchrow">
              <small>
                {slotTime(t, x.slot)}
                <br />
                {t.courts[x.court]} · {x.id}
              </small>
              <button className="textbtn" onClick={() => open(x.id)}>
                {names(x.a)} <small>vs</small> {names(x.b)}
              </button>
              <Status value={x.status} />
              {admin && x.status === "scheduled" && (
                <button onClick={() => set(edit === x.id ? "" : x.id)}>
                  Assign
                </button>
              )}
            </div>
            {edit === x.id && (
              <form
                className="teamrow"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  if (
                    await action(
                      "assign",
                      {
                        court: +f.get("court")!,
                        slot: +f.get("slot")!,
                        ref: f.get("ref"),
                      },
                      x,
                    )
                  )
                    set("");
                }}
              >
                <Field label="Court">
                  <select name="court" defaultValue={x.court}>
                    {t.courts.map((c, i) => (
                      <option key={c} value={i}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="30-minute slot (0 = 09:00, 16 = next day)">
                  <input
                    type="number"
                    min="0"
                    name="slot"
                    defaultValue={x.slot}
                  />
                </Field>
                <Field label="Referee UID">
                  <input name="ref" defaultValue={x.ref} />
                </Field>
                <button>Save assignment</button>
              </form>
            )}
          </div>
        ))}
    </div>
  );
}
function Scoring({
  t,
  d,
  m,
  names,
  action,
  edit,
  admin,
  blocked,
  history,
}: {
  t: Tournament;
  d: Division;
  m: Match;
  names: Names;
  action: ActionFn;
  edit: boolean;
  admin: boolean;
  blocked: boolean;
  history: import("../shared/model").Audit[];
}) {
  const [review, setReview] = useState(false);
  const score = m.games.at(-1)!,
    done = gameWinner(score, m.rules) >= 0,
    winner = matchWinner(m),
    locked = blocked || t.paused || (d.review && m.phase === "playoff");
  return (
    <>
      <div className="sectionhead">
        <div>
          <div className="eyebrow">
            {t.courts[m.court]} / Match {m.id} /{" "}
            {m.phase === "pool" ? pool(m.pool) : "Playoff"}
          </div>
          <h2>Game {m.games.length}</h2>
        </div>
        <Status value={m.status} />
      </div>
      <p>
        First to {m.rules.target} · Win by {m.rules.margin} · Best of{" "}
        {m.rules.bestOf}
      </p>
      <div className="scoregrid">
        {[m.a, m.b].map((id, i) => (
          <section key={i} className="scoring">
            <h3>{names(id)}</h3>
            <b data-testid={"score-" + i}>{score[i]}</b>
            <p>{gamesWon(m)[i]} games won</p>
            {edit && m.status === "live" && (
              <div>
                <button
                  className="primary"
                  disabled={locked || done}
                  onClick={() => action("point", { side: i }, m)}
                >
                  +1 {names(id)}
                </button>
                <button
                  disabled={locked || score[i] === 0}
                  onClick={() => action("subtract", { side: i }, m)}
                >
                  Subtract 1
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
      {edit && (
        <div className="actions panel">
          {m.status === "scheduled" && (
            <button
              className="primary"
              disabled={locked || !m.a || !m.b}
              onClick={() => action("start", {}, m)}
            >
              Start match
            </button>
          )}
          {m.status === "live" && (
            <>
              <button
                disabled={locked || !m.undo.length}
                onClick={() => action("undo", {}, m)}
              >
                Undo last action
              </button>
              {done && !winner && (
                <button disabled={locked} onClick={() => action("next", {}, m)}>
                  Start next game
                </button>
              )}
              {winner && (
                <button
                  className="primary"
                  disabled={locked}
                  onClick={() => setReview(true)}
                >
                  Review final result
                </button>
              )}
              <button
                disabled={locked}
                onClick={() => {
                  const reason = prompt(
                    "Record a forfeit, withdrawal or retirement for administrator review",
                  );
                  if (reason) action("incident", { reason }, m);
                }}
              >
                Report incident
              </button>
            </>
          )}
          {admin && m.status === "reopened" && winner && (
            <button disabled={blocked} onClick={() => setReview(true)}>
              Review corrected result
            </button>
          )}
          {admin && ["final", "review"].includes(m.status) && (
            <button
              disabled={blocked}
              onClick={() => {
                const reason = prompt("Reason to reopen this result");
                if (reason) action("reopen", { reason }, m);
              }}
            >
              Reopen result
            </button>
          )}
        </div>
      )}
      {review && edit && winner && ["live", "reopened"].includes(m.status) && (
        <div className="panel">
          <h3>Confirm {names(winner)} as winner?</h3>
          <p>{m.games.map((g) => g.join("–")).join(" / ")}</p>
          <button
            disabled={m.status === "reopened" ? blocked : locked}
            className="primary"
            onClick={async () => {
              if (await action("confirm", {}, m)) setReview(false);
            }}
          >
            Confirm final result
          </button>{" "}
          <button onClick={() => setReview(false)}>Cancel</button>
        </div>
      )}
      {admin && ["live", "reopened"].includes(m.status) && (
        <details className="panel">
          <summary>Correct game scores</summary>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const games = String(f.get("games"))
                .split(",")
                .map((s) => s.trim().split("-").map(Number));
              action("correct", { games, reason: f.get("reason") }, m);
            }}
          >
            <Field label="Games, e.g. 11-7, 9-11, 12-10">
              <input
                name="games"
                required
                defaultValue={m.games.map((g) => g.join("-")).join(", ")}
              />
            </Field>
            <Field label="Reason for correction">
              <input required name="reason" />
            </Field>
            <button disabled={blocked}>Save correction</button>
          </form>
        </details>
      )}
      <div className="panel">
        <h3>Game scores</h3>
        {m.games.map((g, i) => (
          <p key={i}>
            Game {i + 1} <b>{g.join(" – ")}</b>
          </p>
        ))}
        {m.winner && <p>Winner · {names(m.winner)}</p>}
        {m.reason && <p>{m.reason}</p>}
      </div>
      {edit && (
        <details className="panel">
          <summary>Score history ({history.length})</summary>
          {history
            .slice()
            .reverse()
            .map((a) => (
              <p key={a.id}>
                <b>{a.kind}</b> · {a.after.map((g) => g.join("–")).join(", ")} ·{" "}
                {a.by} · {new Date(a.time).toLocaleTimeString()} {a.reason}
              </p>
            ))}
        </details>
      )}
    </>
  );
}
function Admin({
  t,
  d,
  action,
  send,
  nav,
}: {
  t: Tournament;
  d: Division;
  action: ActionFn;
  send: (mode: string, data: any) => Promise<boolean>;
  nav: (p: string) => void;
}) {
  const [teams, setTeams] = useState(d.teams);
  return (
    <>
      <div className="sectionhead">
        <h2>Tournament desk</h2>
        <button onClick={() => nav("newdivision")}>Add division</button>
      </div>
      <div className="panel">
        <h3>{d.config.name}</h3>
        <p>
          {d.teams.length} entries · {d.config.sizes.length} pools ·{" "}
          {d.matches.length} matches
        </p>
        <div className="actions">
          <button
            className="primary"
            disabled={!!d.matches.length}
            onClick={() => action("generate")}
          >
            Generate schedule
          </button>
          {d.config.format === "hybrid" && (
            <button onClick={() => action("playoffs")}>
              Generate playoffs
            </button>
          )}
          <button onClick={() => action("publish", { value: !d.published })}>
            {d.published ? "Unpublish" : "Publish"} standings
          </button>
          <button
            onClick={() =>
              send("settings", { settings: { paused: !t.paused } })
            }
          >
            {t.paused ? "Resume" : "Pause"} operations
          </button>
        </div>
        {d.review && (
          <p className="notice error">
            Bracket needs review. Inspect dependent matches before resuming.{" "}
            <button
              onClick={() => {
                const reason = prompt(
                  "Record your bracket review and decision",
                );
                if (reason) action("acceptBracket", { reason });
              }}
            >
              Record decision
            </button>
          </p>
        )}
      </div>
      <details className="panel">
        <summary>Teams and pool draw</summary>
        {d.matches.length ? (
          <div>
            {d.teams.map((x) => (
              <p key={x.id}>
                <b>{x.name}</b> · {x.players.join(" / ")} · {pool(x.pool)}
              </p>
            ))}
          </div>
        ) : (
          <>
            <TeamEditor
              teams={teams}
              set={setTeams}
              pools={d.config.sizes.length}
            />
            <button onClick={() => action("teams", { teams })}>
              Save team draw
            </button>
          </>
        )}
      </details>
      <details className="panel">
        <summary>Referee permissions</summary>
        <form
          className="teamrow"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            send("staff", { uid: f.get("uid"), role: f.get("role") });
          }}
        >
          <Field label="Account UID">
            <input
              required
              name="uid"
              placeholder="Firebase UID or demo referee"
            />
          </Field>
          <Field label="Access">
            <select name="role">
              <option>referee</option>
              <option>spectator</option>
            </select>
          </Field>
          <button>Save access</button>
        </form>
      </details>
      <details className="panel">
        <summary>Resolve a ranking tie</summary>
        <p>
          Record the ordered IDs within the tied group and the decision,
          including a coin toss if used.
        </p>
        <small>{d.teams.map((x) => x.id + " = " + x.name).join(" · ")}</small>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            action("order", {
              key: f.get("key"),
              ids: String(f.get("ids"))
                .split(",")
                .map((s) => s.trim()),
              reason: f.get("reason"),
            });
          }}
        >
          <Field label="Ranking group">
            <select name="key">
              {d.config.sizes.map((_, i) => (
                <option key={i} value={"p" + i}>
                  {pool(i)}
                </option>
              ))}
              {Array.from({ length: d.config.advance + 1 }, (_, i) => (
                <option key={i} value={"seed" + i}>
                  Across pools · place {i + 1}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ordered entry IDs">
            <input required name="ids" />
          </Field>
          <Field label="Decision">
            <input required name="reason" />
          </Field>
          <button>Save decision</button>
        </form>
      </details>
      <details className="panel">
        <summary>Tournament details and courts</summary>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            send("settings", {
              settings: {
                ...Object.fromEntries(f),
                courts: String(f.get("courts"))
                  .split(",")
                  .map((s) => s.trim()),
                visible: f.has("visible"),
              },
            });
          }}
        >
          {(
            [
              "name",
              "venue",
              "location",
              "date",
              "timezone",
              "organizer",
              "courts",
            ] as const
          ).map((k) => (
            <Field key={k} label={k}>
              <input
                required
                name={k}
                defaultValue={k === "courts" ? t.courts.join(", ") : t[k]}
              />
            </Field>
          ))}
          <label>
            <input type="checkbox" name="visible" defaultChecked={t.visible} />{" "}
            Public event
          </label>
          <button>Save details</button>
        </form>
      </details>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
