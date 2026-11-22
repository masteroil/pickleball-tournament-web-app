import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import seed from "../functions/lib/shared/seed.js";
const httpHost =
  process.env.LOCAL_CALLABLE_TEST_HOST === "1"
    ? (await import("./callable-test-host.cjs")).default.listen(
        5002,
        "127.0.0.1",
      )
    : null;
const projectId = "demo-courtside";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw Error("Requires emulators: run npm run test:firebase");
function client(name) {
  const app = initializeApp(
      { projectId, apiKey: "demo-key", appId: "demo" },
      name,
    ),
    auth = getAuth(app),
    db = getFirestore(app),
    fn = getFunctions(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(fn, "127.0.0.1", httpHost ? 5002 : 5001);
  return { app, auth, db, call: (name, p) => httpsCallable(fn, name)(p) };
}
const admin = client("admin"),
  ref = client("ref"),
  publicUser = client("public"),
  rid = () => crypto.randomUUID();
const tid = rid(),
  eid = "mixed",
  ev = (c) => doc(c.db, "tournaments", tid, "events", eid);
const state = async (c) =>
  JSON.parse((await getDocFromServer(ev(c))).get("state"));
const base = () => ({ tid, eid, requestId: rid() });
const act = (kind, expected, data = {}, match = "P1") => {
  const p = base();
  return {
    ...p,
    action: {
      kind,
      expected,
      data,
      requestId: p.requestId,
      ...(match ? { match } : {}),
    },
  };
};
try {
  const a = (
    await createUserWithEmailAndPassword(
      admin.auth,
      rid() + "@test.invalid",
      "test-password",
    )
  ).user;
  const b = (
    await createUserWithEmailAndPassword(
      ref.auth,
      rid() + "@test.invalid",
      "test-password",
    )
  ).user;
  const d = seed.demoDivision();
  await admin.call("createTournament", {
    ...base(),
    tournament: seed.demoTournament,
    division: d,
  });
  await assert.rejects(setDoc(ev(publicUser), { state: "bad" }));
  await assert.rejects(setDoc(ev(ref), { state: "bad" }));
  await assert.rejects(
    publicUser.call("applyScoreAction", act("generate", 0, {}, "")),
  );
  await admin.call("applyScoreAction", act("generate", 0, {}, ""));
  await admin.call("manageReferee", { ...base(), uid: b.uid, role: "referee" });
  await assert.rejects(ref.call("applyScoreAction", act("start", 0)));
  await admin.call(
    "applyScoreAction",
    act("assign", 0, { court: 0, slot: 0, ref: b.uid }),
  );
  await ref.call("applyScoreAction", act("start", 1));
  const observed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(Error("Spectator listener timeout"));
    }, 10000);
    const unsub = onSnapshot(
      ev(publicUser),
      (snap) => {
        const first = JSON.parse(snap.get("state")).matches[0];
        if (first.games[0][0] === 1) {
          clearTimeout(timer);
          unsub();
          resolve();
        }
      },
      reject,
    );
  });
  const point = act("point", 2, { side: 0 });
  await ref.call("applyScoreAction", point);
  await ref.call("applyScoreAction", point);
  await observed;
  assert.deepEqual((await state(publicUser)).matches[0].games, [[1, 0]]);
  const results = await Promise.allSettled(
    [0, 1].map((side) =>
      ref.call("applyScoreAction", act("point", 3, { side })),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(
    ref.call(
      "correctScore",
      act("correct", 4, { games: [[15, 10]], reason: "desk review" }),
    ),
  );
  await admin.call(
    "correctScore",
    act("correct", 4, { games: [[15, 10]], reason: "desk review" }),
  );
  const confirmed = act("confirm", 5);
  await ref.call("confirmResult", confirmed);
  await ref.call("confirmResult", confirmed);
  const standings = doc(
    publicUser.db,
    "tournaments",
    tid,
    "events",
    eid,
    "standings",
    "current",
  );
  assert.equal(
    JSON.parse((await getDocFromServer(standings)).get("rows"))[0].reduce(
      (n, r) => n + r.wins,
      0,
    ),
    1,
  );
  await admin.call(
    "reopenMatch",
    act("reopen", 6, { reason: "score reversal" }),
  );
  await admin.call(
    "correctScore",
    act("correct", 7, { games: [[8, 15]], reason: "signed sheet" }),
  );
  await admin.call("confirmResult", act("confirm", 8));
  assert.equal((await state(publicUser)).matches[0].winner, d.matches[0].b);
  await assert.rejects(
    getDocFromServer(
      doc(
        publicUser.db,
        "tournaments",
        tid,
        "events",
        eid,
        "audit",
        a.uid + "_" + point.requestId,
      ),
    ),
  );
  await admin.call("editTournament", {
    ...base(),
    settings: { visible: false },
  });
  await assert.rejects(getDocFromServer(ev(publicUser)));
  await state(ref);
  await admin.call("manageReferee", {
    ...base(),
    uid: b.uid,
    role: "spectator",
  });
  await assert.rejects(getDocFromServer(ev(ref)));
  console.log(
    "PASS: anonymous visibility, direct writes, auth, assignment, retry, concurrent conflict, correction, standings, private audit and revocation",
  );
} finally {
  httpHost?.close();
  await Promise.all([admin, ref, publicUser].map((c) => deleteApp(c.app)));
}
