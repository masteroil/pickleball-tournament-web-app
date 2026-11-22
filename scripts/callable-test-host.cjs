// Emulator-only HTTP host for runners that cannot create the Functions emulator's Unix socket.
// The SDK's actual onCall middleware verifies the emulator Auth ID token.
if (
  process.env.GCLOUD_PROJECT !== "demo-courtside" ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw Error("Emulators required");
const express = require("../functions/node_modules/express");
const functions = require("../functions/lib/functions/src/index.js");
const app = express();
app.use(express.json());
for (const [name, handler] of Object.entries(functions))
  app.post("/demo-courtside/us-central1/" + name, handler);
module.exports = app;
