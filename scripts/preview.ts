// Build into preview.cjs for the standalone local demo distributed with the source.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { localDemo } from "./demo";
const root = resolve(__dirname, "dist");
if (!existsSync(resolve(root, "index.html")))
  throw Error("Build the application before starting the preview.");
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};
const plugin = localDemo();
const handler = createServer();
const configure = plugin.configurePreviewServer as Function;
configure({
  middlewares: {
    use: (middleware: Function) =>
      handler.on("request", (req, res) => {
        middleware(req, res, () => {
          try {
            const pathname = decodeURIComponent(
              new URL(req.url || "/", "http://localhost").pathname,
            );
            const file = resolve(
              root,
              "." + (pathname === "/" ? "/index.html" : pathname),
            );
            if (
              !file.startsWith(root + sep) ||
              !existsSync(file) ||
              !statSync(file).isFile()
            ) {
              res.writeHead(404);
              return res.end();
            }
            res.setHeader(
              "Content-Type",
              mime[extname(file)] || "application/octet-stream",
            );
            createReadStream(file)
              .on("error", () => res.destroy())
              .pipe(res);
          } catch {
            res.writeHead(400);
            res.end();
          }
        });
      }),
  },
});
const port = Number(process.env.PORT || 4173);
handler.listen(port, "127.0.0.1", () =>
  console.log(
    "Pickleball Tournament Live demo: http://127.0.0.1:" + port + "/",
  ),
);
