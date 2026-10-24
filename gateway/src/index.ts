// Gateway placeholder — Brain will replace this with the full implementation.
import http from "http";

const PORT = 8080;

http
  .createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("hello from gateway\n");
  })
  .listen(PORT, () => {
    console.log(`gateway placeholder listening on :${PORT}`);
  });
