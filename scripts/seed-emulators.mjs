import { createRequire } from "node:module";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const { initializeApp } = require("firebase-admin/app"),
  { getAuth } = require("firebase-admin/auth"),
  { getFirestore } = require("firebase-admin/firestore");
initializeApp({ projectId: "demo-courtside" });
const { demoTournament, demoDivision } = require("./lib/shared/seed.js");
const root = getFirestore().doc("tournaments/demo");
for (const uid of ["admin", "referee", "referee2"]) {
  try {
    await getAuth().createUser({
      uid,
      email: uid + "@demo.test",
      password: "Courtside26!",
    });
  } catch (e) {
    if (e.code !== "auth/uid-already-exists") throw e;
  }
}
await getFirestore().runTransaction(async (tx) => {
  if ((await tx.get(root)).exists) return;
  const d = demoDivision();
  tx.create(root, demoTournament);
  tx.create(root.collection("events").doc(d.id), {
    state: JSON.stringify(d),
    name: d.config.name,
  });
  for (const uid of ["admin", "referee", "referee2"])
    tx.create(root.collection("staff").doc(uid), {
      role: uid === "admin" ? "admin" : "referee",
    });
});
console.log("Local emulator practice tournament ready at /#live/demo/mixed");
