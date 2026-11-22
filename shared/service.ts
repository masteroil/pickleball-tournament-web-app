import { apply, newDivision } from "./engine";
import {
  check,
  clean,
  type Division,
  type Tournament,
  type Staff,
  type Action,
  type Team,
  type Config,
} from "./model";
export function tournament(id: string, uid: string, raw: any): Tournament {
  const { name, venue, location, date, timezone, organizer } = raw;
  for (const v of [name, venue, location, date, timezone, organizer]) clean(v);
  check(
    /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)),
    "Invalid date",
  );
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  check(
    Array.isArray(raw.courts) &&
      raw.courts.length > 0 &&
      raw.courts.length <= 32,
    "Choose 1–32 courts",
  );
  const courts = raw.courts.map((v: string) => clean(v));
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
    visible: raw.visible === true,
  };
}
export function division(id: string, data: { config: Config; teams: Team[] }) {
  return newDivision(id, data.config, data.teams);
}
export function mutate(
  d: Division,
  t: Tournament,
  others: Division[],
  actor: Staff,
  act: Action,
  now: number,
) {
  const audit = apply(d, t, actor, act, now);
  const occupied = others.flatMap((v) => v.matches);
  const collides = (
    a: Division["matches"][number],
    b: Division["matches"][number],
  ) => a.court === b.court || Boolean(a.ref && a.ref === b.ref);
  if (["generate", "playoffs"].includes(act.kind)) {
    const generated = d.matches.filter(
      (m) => act.kind === "generate" || m.phase === "playoff",
    );
    if (generated.length) {
      const first = Math.min(...generated.map((m) => m.slot));
      const offset = Math.max(
        0,
        Math.max(-1, ...occupied.map((m) => m.slot)) + 1 - first,
      );
      generated.forEach((m) => (m.slot += offset));
    }
  } else if (act.kind === "assign" || act.kind === "start") {
    const m = d.matches.find((x) => x.id === act.match)!;
    check(
      !occupied.some(
        (x) =>
          collides(x, m) &&
          (act.kind === "assign" ? x.slot === m.slot : x.status === "live"),
      ),
      "Court or referee conflict in another division",
    );
  }
  check(
    JSON.stringify(d).length < 700000,
    "Division exceeds the supported event size",
  );
  return audit;
}

export function additionalDivisions(first: string, additional: any = []) {
  check(
    Array.isArray(additional) && additional.length <= 11,
    "Too many divisions",
  );
  const ids = new Set([first]);
  return additional.map((item) => {
    check(
      typeof item.id === "string" &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(item.id) &&
        !ids.has(item.id),
      "Invalid or duplicate division ID",
    );
    ids.add(item.id);
    return division(item.id, item);
  });
}
