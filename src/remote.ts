import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  collection,
  query,
  where,
  onSnapshot,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";
import { empty, type View } from "./gateway";
import type { Audit, Division, Tournament } from "../shared/model";
const env = import.meta.env;
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app),
  db = getFirestore(app),
  fn = getFunctions(app);
if (env.VITE_USE_EMULATORS === "true") {
  const h = location.hostname;
  connectAuthEmulator(auth, "http://" + h + ":9099", { disableWarnings: true });
  connectFirestoreEmulator(db, h, 8080);
  connectFunctionsEmulator(fn, h, 5001);
}
export const login = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);
export function write(p: any) {
  const endpoints: Record<string, string> = {
    create: "createTournament",
    settings: "editTournament",
    staff: "manageReferee",
    division: "addDivision",
  };
  const special: Record<string, string> = {
    reopen: "reopenMatch",
    correct: "correctScore",
    confirm: "confirmResult",
  };
  return httpsCallable<unknown, { match?: string }>(
    fn,
    endpoints[p.mode] || special[p.action?.kind] || "applyScoreAction",
  )(p);
}
export function watch(
  tid: string,
  cb: (s: View) => void,
  status: (v: string) => void,
) {
  let stops: (() => void)[] = [];
  const stopAuth = onAuthStateChanged(auth, (user) => {
    stops.forEach((f) => f());
    stops = [];
    let s: View = { ...empty, uid: user?.uid || "", history: {} };
    cb(s);
    const emit = () => cb({ ...s });
    const fail = (e: Error) => status(e.message);
    let pub: Tournament[] = [],
      own: Tournament[] = [];
    const catalog = () => {
      s.catalog = [...new Map([...pub, ...own].map((t) => [t.id, t])).values()];
      emit();
    };
    stops.push(
      onSnapshot(
        query(collection(db, "tournaments"), where("visible", "==", true)),
        (v) => {
          pub = v.docs.map((x) => x.data() as Tournament);
          catalog();
        },
        fail,
      ),
    );
    if (user)
      stops.push(
        onSnapshot(
          query(collection(db, "tournaments"), where("owner", "==", user.uid)),
          (v) => {
            own = v.docs.map((x) => x.data() as Tournament);
            catalog();
          },
          fail,
        ),
      );
    if (!tid) return;
    const root = doc(db, "tournaments", tid);
    const audits = new Map<string, () => void>();
    stops.push(() => audits.forEach((f) => f()));
    const histories = () => {
      if (!["admin", "referee"].includes(s.role)) {
        audits.forEach((f) => f());
        audits.clear();
        s.history = {};
        return;
      }
      for (const e of s.events) {
        if (audits.has(e.id)) continue;
        audits.set(
          e.id,
          onSnapshot(
            collection(root, "events", e.id, "audit"),
            (snap) => {
              s.history = {
                ...s.history,
                [e.id]: snap.docs
                  .map((x) => {
                    const v = x.data();
                    return {
                      ...v,
                      before: JSON.parse(v.before),
                      after: JSON.parse(v.after),
                    } as Audit;
                  })
                  .sort((a, b) => a.time - b.time),
              };
              emit();
            },
            fail,
          ),
        );
      }
    };
    if (user)
      stops.push(
        onSnapshot(
          doc(root, "staff", user.uid),
          (v) => {
            s.role = v.data()?.role || "spectator";
            histories();
            emit();
          },
          fail,
        ),
      );
    stops.push(
      onSnapshot(
        root,
        { includeMetadataChanges: true },
        (v) => {
          s.t = v.exists() ? (v.data() as Tournament) : null;
          emit();
          status(v.metadata.fromCache ? "Offline" : "Connected");
        },
        fail,
      ),
    );
    stops.push(
      onSnapshot(
        collection(root, "events"),
        (v) => {
          s.events = v.docs.map((x) => JSON.parse(x.get("state")) as Division);
          histories();
          emit();
        },
        fail,
      ),
    );
  });
  return () => {
    stopAuth();
    stops.forEach((f) => f());
  };
}
