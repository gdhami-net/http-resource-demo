// A deliberately dumb search backend that keeps a log of what happened to every
// request it was handed. The point of the log is the `aborted` flag: it is set
// when the client closed the connection before the response was written, which
// is the only way to tell an abort that reached the network from a callback the
// client quietly threw away.
//
// Endpoints
//   GET  /search?term=<t>&delay=<ms>   answers after <ms>, or gets aborted
//   GET  /report                       the log, as JSON
//   POST /reset                        clears the log
//   GET  /health                       "ok"
//
// No dependencies, no framework. Run it with `npm run server`.

import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8931);
const HOST = '127.0.0.1';

/** @type {{seq:number, term:string, delayMs:number, startedAt:number, endedAt:number|null, aborted:boolean}[]} */
const log = [];
let seq = 0;
const t0 = Date.now();
const now = () => Date.now() - t0;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-store');
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (url.pathname === '/report') {
    json(res, 200, { requests: log });
    return;
  }

  if (url.pathname === '/reset') {
    log.length = 0;
    seq = 0;
    json(res, 200, { ok: true });
    return;
  }

  if (url.pathname !== '/search') {
    json(res, 404, { error: 'not found' });
    return;
  }

  const term = url.searchParams.get('term') ?? '';
  const delayMs = Number(url.searchParams.get('delay') ?? 0);

  const record = {
    seq: seq++,
    term,
    delayMs,
    startedAt: now(),
    endedAt: null,
    aborted: false,
  };
  log.push(record);

  let answered = false;
  const timer = setTimeout(() => {
    if (record.aborted) return;
    answered = true;
    record.endedAt = now();
    json(res, 200, {
      term,
      delayMs,
      results: [`${term} — first hit`, `${term} — second hit`],
    });
  }, delayMs);

  // 'finish' fires once the response has been handed to the socket; 'close'
  // fires when the socket goes away for any reason. A close with no finish
  // before it is the client hanging up mid-request.
  res.on('finish', () => {
    answered = true;
  });
  res.on('close', () => {
    if (answered) return;
    clearTimeout(timer);
    record.aborted = true;
    record.endedAt = now();
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`record-server listening on http://${HOST}:${PORT}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
