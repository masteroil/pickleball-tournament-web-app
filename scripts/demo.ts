import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Plugin, Connect } from "vite";
import { demoTournament, demoDivision } from "../shared/seed";
import {
  additionalDivisions,
  mutate,
  tournament,
  division,
} from "../shared/service";
import {
  check,
  type Audit,
  type Division,
  type Tournament,
  type Staff,
} from "../shared/model";
interface RecordSet {
  t: Tournament;
  events: Division[];
  staff: Record<string, Staff["role"]>;
  history: Record<string, Audit[]>;
}
type Store = {
  records: Record<string, RecordSet>;
  requests: Record<string, string>;
};
export function localDemo(): Plugin {
  const file = process.env.DEMO_FILE || ".demo-state.json";
  let state: Store = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : {
        records: {
          [demoTournament.id]: {
            t: demoTournament,
            events: [demoDivision()],
            staff: { admin: "admin", referee: "referee", referee2: "referee" },
            history: {},
          },
        },
        requests: {},
      };
  const sessions = new Map<string, string>();
  const clients = new Set<() => void>();
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (!url.pathname.startsWith("/demo/")) return next();
    const uid =
      sessions.get(
        String(
          req.headers.authorization || url.searchParams.get("token") || "",
        ),
      ) || "";
    const send = (v: any) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(v));
    };
    try {
      if (url.pathname === "/demo/stream") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        });
        const ping = () => res.write("data: update\n\n");
        clients.add(ping);
        ping();
        const timer = setInterval(() => res.write(": keepalive\n\n"), 15000);
        req.on("close", () => {
          clearInterval(timer);
          clients.delete(ping);
        });
        return;
      }
      if (url.pathname === "/demo/read") {
        const tid = url.searchParams.get("tid") || demoTournament.id;
        const r = state.records[tid];
        const catalog = Object.values(state.records)
          .filter(
            (r) => r.t.visible || ["admin", "referee"].includes(r.staff[uid]),
          )
          .map((r) => r.t);
        const allowed =
          r && (r.t.visible || ["admin", "referee"].includes(r.staff[uid]));
        return send({
          catalog,
          t: allowed ? r.t : null,
          events: allowed ? r.events : [],
          role: allowed ? r.staff[uid] || "spectator" : "spectator",
          uid,
          history:
            allowed && ["admin", "referee"].includes(r.staff[uid])
              ? r.history
              : {},
        });
      }
      check(req.method === "POST", "Use POST");
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        check(body.length < 500000, "Request too large");
      }
      const p = JSON.parse(body);
      if (url.pathname === "/demo/login") {
        const who = String(p.email).split("@")[0];
        check(
          ["admin", "referee", "referee2"].includes(who) &&
            p.email === who + "@demo.test" &&
            p.password === "Courtside26!",
          "Invalid demo login",
        );
        const token = randomUUID();
        sessions.set(token, who);
        return send({ token, uid: who });
      }
      if (url.pathname === "/demo/logout") {
        sessions.delete(String(req.headers.authorization));
        return send({ ok: true });
      }
      check(uid, "Sign in first");
      check(
        /^[\w-]{1,128}$/.test(p.tid) &&
          /^[\w-]{1,128}$/.test(p.eid) &&
          /^[\w-]{1,128}$/.test(p.requestId),
        "Invalid ID",
      );
      const id = uid + "/" + p.tid + "/" + p.requestId;
      const sig = JSON.stringify(p);
      if (state.requests[id]) {
        check(state.requests[id] === sig, "Request ID reused");
        return send({ ok: true });
      }
      const draft = structuredClone(state),
        r = draft.records[p.tid],
        mode = p.mode;
      if (mode === "create") {
        check(!r, "Duplicate tournament");
        draft.records[p.tid] = {
          t: tournament(p.tid, uid, p.tournament),
          events: [
            division(p.eid, p.division),
            ...additionalDivisions(p.eid, p.additional),
          ],
          staff: { [uid]: "admin" },
          history: {},
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
            Date.now(),
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
              "Invalid role",
            );
            r.staff[p.uid] = p.role;
          } else if (mode === "division") {
            check(!r.events.some((d) => d.id === p.eid), "Duplicate division");
            const ds = [
              division(p.eid, p.division),
              ...additionalDivisions(p.eid, p.additional),
            ];
            check(
              !ds.some((v) => r.events.some((e) => v.id === e.id)),
              "Duplicate division",
            );
            r.events.push(...ds);
          } else throw Error("Unknown operation");
        }
      }
      draft.requests[id] = sig;
      writeFileSync(file + ".tmp", JSON.stringify(draft));
      renameSync(file + ".tmp", file);
      state = draft;
      const committed = r?.events
        .find((v) => v.id === p.eid)
        ?.matches.find((m) => m.id === p.action?.match);
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
      s.middlewares.use(handler);
    },
    configurePreviewServer(s) {
      s.middlewares.use(handler);
    },
  };
}
