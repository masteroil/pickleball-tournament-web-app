import { requestId } from "./ids";
import React, { useState } from "react";
import { defaultConfig, guideEvents } from "../shared/seed";
import { newDivision } from "../shared/engine";
import type {
  Config,
  Rules,
  Team,
  Tournament,
  Division,
} from "../shared/model";
export type Run = (fn: () => Promise<unknown>) => Promise<boolean>;
export const pool = (i: number) => "Pool " + String.fromCharCode(65 + i);
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Wizard({
  existing,
  save,
}: {
  existing?: Tournament;
  save: (t: any, d: Division[]) => Promise<boolean>;
}) {
  const [step, setStep] = useState(existing ? 1 : 0),
    [error, err] = useState(""),
    [busy, loading] = useState(false);
  const [t, setT] = useState({
    name: "",
    venue: "El Nido Pickle Park",
    location: "El Nido, Palawan",
    date: "2026-12-04",
    timezone: "Asia/Manila",
    organizer: "",
    courts: "Court 1, Court 2, Court 3, Court 4",
    visible: true,
  });
  const [config, setC] = useState<Config>(structuredClone(defaultConfig)),
    [count, nTeams] = useState(8),
    [pools, nPools] = useState(2),
    [preset, setPreset] = useState("custom"),
    [teams, setTeams] = useState<Team[]>([]);
  const assign = (k: keyof Config, v: any) => setC({ ...config, [k]: v });
  function prepare() {
    const sizes = Array.from(
      { length: pools },
      (_, i) => Math.floor(count / pools) + (i < count % pools ? 1 : 0),
    );
    const c = { ...config, sizes };
    let n = 0;
    const rows = sizes.flatMap((size, pool) =>
      Array.from({ length: size }, () => {
        n++;
        return {
          id: "team-" + n,
          name: "Team " + n,
          players: Array.from(
            { length: c.type === "singles" ? 1 : 2 },
            (_, i) => "Player " + n + String.fromCharCode(65 + i),
          ),
          pool,
        };
      }),
    );
    newDivision("main", c, rows);
    setC(c);
    setTeams(rows);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    err("");
    try {
      if (step === 0) {
        setStep(1);
        return;
      }
      if (step === 1 && preset === "custom") {
        prepare();
        setStep(2);
        return;
      }
      const ds =
        preset === "guide"
          ? guideEvents()
          : [newDivision("division-" + requestId().slice(0, 8), config, teams)];
      loading(true);
      await save(
        { ...t, courts: t.courts.split(",").map((s) => s.trim()) },
        ds,
      );
    } catch (e) {
      err(String((e as Error).message));
    } finally {
      loading(false);
    }
  }
  return (
    <form className="panel form" onSubmit={submit}>
      <div className="eyebrow">Tournament setup · Step {step + 1} of 3</div>
      <h2>
        {["Tournament details", "Competition format", "Register entries"][step]}
      </h2>
      {step === 0 && (
        <>
          <div className="formgrid">
            {(
              [
                "name",
                "organizer",
                "venue",
                "location",
                "date",
                "timezone",
                "courts",
              ] as const
            ).map((k) => (
              <Field
                key={k}
                label={
                  {
                    name: "Tournament name",
                    organizer: "Organizer",
                    venue: "Venue",
                    location: "Location",
                    date: "Start date",
                    timezone: "Time zone",
                    courts: "Court names, separated by commas",
                  }[k]
                }
              >
                <input
                  required
                  type={k === "date" ? "date" : "text"}
                  value={t[k]}
                  onChange={(e) => setT({ ...t, [k]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <label>
            <input
              type="checkbox"
              checked={t.visible}
              onChange={(e) => setT({ ...t, visible: e.target.checked })}
            />{" "}
            Public tournament
          </label>
        </>
      )}
      {step === 1 && (
        <>
          <Field label="Tournament preset">
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              <option value="custom">Custom division</option>
              <option value="guide">
                El Nido Open 2026 · 7 guide divisions
              </option>
            </select>
          </Field>
          {preset === "guide" ? (
            <p>
              Creates 80 editable entries in 20 pools. Register players from the
              draw before generating the schedule.
            </p>
          ) : (
            <div className="formgrid">
              <Field label="Division name">
                <input
                  required
                  value={config.name}
                  onChange={(e) => assign("name", e.target.value)}
                />
              </Field>
              {(
                [
                  ["type", "Entry type", ["singles", "doubles"]],
                  [
                    "format",
                    "Tournament format",
                    ["hybrid", "round-robin", "elimination"],
                  ],
                  [
                    "policy",
                    "Ranking and scoring preset",
                    ["local", "official"],
                  ],
                ] as const
              ).map(([k, l, opts]) => (
                <Field key={k} label={l}>
                  <select
                    value={config[k]}
                    onChange={(e) => assign(k, e.target.value)}
                  >
                    {opts.map((o) => (
                      <option key={o} value={o}>
                        {
                          {
                            hybrid: "Pools + playoffs",
                            "round-robin": "Round robin",
                            elimination: "Single elimination",
                            local: "Custom / El Nido",
                            official: "USA Pickleball 2026 · side-out",
                            singles: "Singles",
                            doubles: "Doubles",
                          }[o]
                        }
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              <Field label="Number of entries">
                <input
                  type="number"
                  min="2"
                  max="64"
                  value={count}
                  onChange={(e) => nTeams(+e.target.value)}
                />
              </Field>
              <Field label="Number of pools">
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={pools}
                  onChange={(e) => nPools(+e.target.value)}
                />
              </Field>
              <Field label="Qualifiers per pool">
                <input
                  type="number"
                  min="1"
                  value={config.advance}
                  onChange={(e) => assign("advance", +e.target.value)}
                />
              </Field>
              {(["poolRules", "playoffRules"] as const).map((k) => (
                <fieldset key={k}>
                  <legend>
                    {k === "poolRules" ? "Pool scoring" : "Playoff scoring"}
                  </legend>
                  {(["target", "margin", "bestOf"] as (keyof Rules)[]).map(
                    (n) => (
                      <Field
                        key={n}
                        label={
                          {
                            target: "Target points",
                            margin: "Win by",
                            bestOf: "Best of",
                          }[n]
                        }
                      >
                        <select
                          value={config[k][n]}
                          onChange={(e) =>
                            assign(k, { ...config[k], [n]: +e.target.value })
                          }
                        >
                          {{
                            target: [11, 15, 21],
                            margin: [1, 2],
                            bestOf: [1, 3, 5],
                          }[n].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </Field>
                    ),
                  )}
                </fieldset>
              ))}
            </div>
          )}
        </>
      )}
      {step === 2 && (
        <TeamEditor teams={teams} set={setTeams} pools={config.sizes.length} />
      )}
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        {step > (existing ? 1 : 0) && (
          <button type="button" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        <button className="primary" disabled={busy}>
          {busy
            ? "Creating…"
            : step === 2 || (step === 1 && preset === "guide")
              ? "Create " + (existing ? "division" : "tournament")
              : "Continue"}
        </button>
      </div>
    </form>
  );
}
export function TeamEditor({
  teams,
  set,
  pools,
}: {
  teams: Team[];
  set: (v: Team[]) => void;
  pools: number;
}) {
  const change = (i: number, delta: Partial<Team>) =>
    set(teams.map((t, j) => (j === i ? { ...t, ...delta } : t)));
  return (
    <div>
      {teams.map((t, i) => (
        <div className="teamrow" key={t.id}>
          <Field label="Entry name">
            <input
              required
              value={t.name}
              onChange={(e) => change(i, { name: e.target.value })}
            />
          </Field>
          {t.players.map((n, j) => (
            <Field label={"Player " + (j + 1)} key={j}>
              <input
                required
                value={n}
                onChange={(e) =>
                  change(i, {
                    players: t.players.map((v, k) =>
                      k === j ? e.target.value : v,
                    ),
                  })
                }
              />
            </Field>
          ))}
          <Field label="Pool">
            <select
              value={t.pool}
              onChange={(e) => change(i, { pool: +e.target.value })}
            >
              {Array.from({ length: pools }, (_, j) => (
                <option key={j} value={j}>
                  {pool(j)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ))}
    </div>
  );
}
