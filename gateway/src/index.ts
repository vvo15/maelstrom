// Gateway placeholder (Bait, compose skeleton). Brain replaces this with the real gateway.
// Only job: pass every request through to the decoy with the contract's session header,
// so the decoy can be tested end to end at localhost:8080. No detection, no maze, no events.
import http from "node:http";
import { createHash } from "node:crypto";
import { SESSION_HEADER } from "../../shared/contracts";

const PORT = 8080;
const DECOY_URL = process.env["DECOY_URL"] ?? "http://decoy";

// Hop-by-hop or recomputed headers that must not be copied across the proxy.
const SKIP_REQUEST = new Set([
  "host", "connection", "keep-alive", "transfer-encoding", "upgrade",
  "content-length", "expect", "te", "trailer", "proxy-connection", SESSION_HEADER,
]);
const SKIP_RESPONSE = new Set([
  "connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding",
]);

http
  .createServer(async (req, res) => {
    // Session id per shared/contracts.ts: first 16 hex of sha256(ip + "|" + userAgent).
    const ip = req.socket.remoteAddress ?? "";
    const ua = req.headers["user-agent"] ?? "";
    const sessionId = createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 16);

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);

    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || SKIP_REQUEST.has(name)) continue;
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    headers.set(SESSION_HEADER, sessionId); // inbound copies were stripped above

    try {
      const method = req.method ?? "GET";
      const upstream = await fetch(DECOY_URL + (req.url ?? "/"), {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
        redirect: "manual",
      });
      const out: Record<string, string> = {};
      upstream.headers.forEach((value, name) => {
        if (!SKIP_RESPONSE.has(name)) out[name] = value;
      });
      res.writeHead(upstream.status, out);
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("decoy unreachable\n");
    }
  })
  .listen(PORT, () => {
    console.log(`gateway placeholder: proxying :${PORT} -> ${DECOY_URL}`);
  });
