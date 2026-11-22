import { defineConfig, loadEnv } from "vite";
import tailwind from "@tailwindcss/vite";
import { localDemo } from "./scripts/demo";
export default defineConfig(({ mode }) => ({
  plugins: [
    tailwind(),
    ...(loadEnv(mode, process.cwd()).VITE_FIREBASE_API_KEY
      ? []
      : [localDemo()]),
  ],
  server: { host: "0.0.0.0" },
}));
