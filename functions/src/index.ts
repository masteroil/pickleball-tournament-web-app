import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import {
  additionalDivisions,
  mutate,
  division,
  tournament,
} from "../../shared/service";
import {
  check,
  clean,
  type Division,
  type Tournament,
  type Staff,
} from "../../shared/model";
import { table } from "../../shared/engine";
initializeApp();
const db = getFirestore();
function key(v: unknown) {
  check(
    typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v),
    "Invalid identifier",
  );
  return v;
}
async function handle(req: CallableRequest, mode: string) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first");
  const uid = req.auth.uid;
  const p = req.data;
  try {
    return await db.runTransaction(async (tx) => {
      const tid = key(p.tid),
        eid = key(p.eid || "main"),
        rid = key(p.requestId);
      const root = db.collection("tournaments").doc(tid);
      const receipt = root.collection("requests").doc(uid + "_" + rid);
      const seen = await tx.get(receipt);
      if (seen.exists) {
        check(
          seen.get("payload") === JSON.stringify([mode, p]),
          "Request ID reused",
        );
        return seen.get("result");
      }
      const snap = await tx.get(root);
      const staffDoc = root.collection("staff").doc(uid);
      let result: any = { ok: true };
      if (mode === "create") {
        check(!snap.exists, "Tournament ID in use");
        const t = tournament(tid, uid, p.tournament);
        const d = division(eid, p.division);
        tx.create(root, t);
        tx.create(staffDoc, { role: "admin" });
        for (const item of [d, ...additionalDivisions(eid, p.additional)])
          tx.create(root.collection("events").doc(item.id), {
            name: item.config.name,
            state: JSON.stringify(item),
          });
      } else {
        check(snap.exists, "Unknown tournament");
        const t = snap.data() as Tournament;
        const staff = await tx.get(staffDoc);
        const actor: Staff = { uid, role: staff.get("role") || "spectator" };
        if (mode === "settings" || mode === "staff" || mode === "division") {
          check(actor.role === "admin", "Permission denied");
          if (mode === "settings") {
            const updated = tournament(tid, t.owner, { ...t, ...p.settings });
            check(
              updated.courts.length >= t.courts.length,
              "Courts already registered",
            );
            tx.update(root, { ...updated });
          }
          if (mode === "staff") {
            const who = key(p.uid);
            check(
              who !== t.owner && ["referee", "spectator"].includes(p.role),
              "Invalid referee permission",
            );
            tx.set(root.collection("staff").doc(who), { role: p.role });
          }
          if (mode === "division") {
            const d = division(eid, p.division);
            for (const item of [d, ...additionalDivisions(eid, p.additional)])
              tx.create(root.collection("events").doc(item.id), {
                name: item.config.name,
                state: JSON.stringify(item),
              });
          }
        } else {
          const events = await tx.get(root.collection("events"));
          const all = events.docs.map(
            (doc) => JSON.parse(doc.get("state")) as Division,
          );
          const d = all.find((v) => v.id === eid);
          check(d, "Unknown division");
          const act = p.action;
          check(act.requestId === rid, "Request ID mismatch");
          check(
            mode === "confirm"
              ? act.kind === "confirm"
              : mode === "reopen"
                ? act.kind === "reopen"
                : mode === "correct"
                  ? act.kind === "correct"
                  : !["confirm", "reopen", "correct"].includes(act.kind),
            "Wrong endpoint",
          );
          const audit = mutate(
            d,
            t,
            all.filter((v) => v !== d),
            actor,
            act,
            Date.now(),
          );
          const event = root.collection("events").doc(eid);
          tx.update(event, { state: JSON.stringify(d) });
          tx.create(event.collection("audit").doc(uid + "_" + rid), {
            ...audit,
            before: JSON.stringify(audit.before),
            after: JSON.stringify(audit.after),
            committedAt: FieldValue.serverTimestamp(),
          });
          const rows = d.config.sizes.map((_, i) => table(d, i));
          tx.set(event.collection("standings").doc("current"), {
            published: d.published,
            rows: JSON.stringify(rows),
            revision: d.revision,
          });
          result = {
            version: d.revision,
            match: JSON.stringify(
              d.matches.find((m) => m.id === act.match) || null,
            ),
          };
        }
      }
      tx.create(receipt, {
        payload: JSON.stringify([mode, p]),
        result,
        at: FieldValue.serverTimestamp(),
      });
      return result;
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid operation";
    throw new HttpsError(
      message.includes("denied")
        ? "permission-denied"
        : message.includes("Conflict")
          ? "aborted"
          : "failed-precondition",
      message,
    );
  }
}
export const createTournament = onCall((r) => handle(r, "create"));
export const editTournament = onCall((r) => handle(r, "settings"));
export const manageReferee = onCall((r) => handle(r, "staff"));
export const addDivision = onCall((r) => handle(r, "division"));
export const applyScoreAction = onCall((r) => handle(r, "action"));
export const confirmResult = onCall((r) => handle(r, "confirm"));
export const reopenMatch = onCall((r) => handle(r, "reopen"));
export const correctScore = onCall((r) => handle(r, "correct"));
