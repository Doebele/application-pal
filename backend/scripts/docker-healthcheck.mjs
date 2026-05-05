// Minimaler HTTP-Check fuer Docker HEALTHCHECK (ESM, ohne Inline-eval).
import http from "node:http";

const port = (process.env.PORT ?? "").trim() || "3000";

const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
  res.resume();
  process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on("error", () => process.exit(1));
req.setTimeout(4000, () => {
  req.destroy();
  process.exit(1);
});
