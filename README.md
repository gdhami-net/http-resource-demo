# http-resource-demo

Companion repo for the post **"The request that cancels itself"**
([gdhami.net](https://gdhami.net) — link added when the post is live).

Five search boxes, one backend, one race. The backend is a 120-line Node server
that takes its own latency as a query parameter and keeps a log of every request
it was handed, including whether the client hung up before it answered. That log
is the point: it is the difference between a request that was really cancelled
on the wire and a callback the client quietly threw away.

## The race

`an` is typed first and the server is told to take 600ms over it. `ang` is typed
150ms later and the server is told to take 50ms. So the *older* request is
always the *last* to answer, which is the only version of this test worth
running — if the newest request also answered first, the right answer would win
by luck rather than by cancellation.

| | what the box shows at the end | server's view of the `an` request |
|---|---|---|
| `httpResource` | `ang` | aborted after ~156ms of the 600ms it was asked for |
| `switchMap` | `ang` | aborted |
| `mergeMap` | `an` | answered in full, 600ms |
| plain `.subscribe()` | `an` | answered in full, 600ms |

The two failing rows are the bug: the stale answer for `an` lands last and
overwrites the correct answer for `ang`. `mergeMap` is in there because reaching
for a flattening operator is not the same as fixing the race.

The fifth box puts `debounced` (new in Angular 22.0, still experimental) between
the typed term and the resource, because `httpResource` has no debounce of its
own.

A real `/report` payload from the `httpResource` run on the default backend:

```json
{"requests":[
  {"seq":0,"term":"an","delayMs":600,"startedAt":3538,"endedAt":3694,"aborted":true},
  {"seq":1,"term":"ang","delayMs":50,"startedAt":3694,"endedAt":3753,"aborted":false}
]}
```

`an` was cut off at 3694ms — 156ms into a 600ms wait, and the same millisecond
`ang` started. The abort happens before the replacement request goes out, not
after. The same run under `withXhr()` cut it off at 159ms.

## Run it

```bash
npm install
npm run check
```

`npm run check` starts the recording server on 127.0.0.1:8931, runs the Angular
unit-test target against it, and shuts the server down again. Nothing else is
needed; the tests are the assertions.

```
 ✓ the default backend (fetch) > httpResource: the abandoned request never reaches the view
 ✓ the default backend (fetch) > httpResource: the abort reaches the server, which stops early
 ✓ the default backend (fetch) > plain subscribe: the same timings put the stale answer on screen
 ✓ the default backend (fetch) > switchMap: the hand-rolled fix aborts the same request httpResource does
 ✓ the default backend (fetch) > mergeMap: an operator that is not switchMap leaves the race exactly where it was
 ✓ the default backend (fetch) > httpResource: a source change that produces the same URL still refetches
 ✓ the XHR backend, via withXhr() > httpResource: the abandoned request never reaches the view
 ✓ the XHR backend, via withXhr() > httpResource: the abort reaches the server, which stops early
 ✓ the XHR backend, via withXhr() > plain subscribe: the same timings put the stale answer on screen
 ✓ the XHR backend, via withXhr() > switchMap: the hand-rolled fix aborts the same request httpResource does
 ✓ the XHR backend, via withXhr() > mergeMap: an operator that is not switchMap leaves the race exactly where it was
 ✓ the XHR backend, via withXhr() > httpResource: a source change that produces the same URL still refetches
 ✓ debounced() in front of the resource > the same four keystrokes without it put four requests on the wire
 ✓ debounced() in front of the resource > a burst of keystrokes reaches the server as one request

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

To poke at it by hand instead:

```bash
npm run server        # terminal 1
npm start             # terminal 2, then open http://localhost:4200
```

Type `an`, then immediately `ang`, in each of the five boxes, and read
http://127.0.0.1:8931/report afterwards.

## What each test proves

1. **The abandoned response never reaches the view.** The component records
   every value its `showing:` binding has taken, and `an` never appears in that
   list — not even for a frame, 600ms in, when its response would otherwise have
   arrived.
2. **The abort reaches the server.** The server marks a request `aborted` when
   the connection closed before it wrote a response, and it records how long it
   actually ran. For `httpResource` and `switchMap` that number is well under
   the 600ms the server was asked for. For the other two it is the full 600ms.
   Nothing about this claim depends on what the client did with the callback.
3. **The bug is real, not described.** The plain-subscribe and `mergeMap`
   versions are asserted to end up showing `an` under exactly the same timings.
   If those two ever start passing, the timings have stopped racing and the
   other assertions have stopped meaning anything.
4. **It holds on both HTTP backends.** Those six run twice: once on the Fetch
   backend, which `provideHttpClient()` gives you by default since Angular 22.0,
   and once on the XHR backend via `withXhr()`. The teardown that aborts the
   request is different code in each.
5. **`httpResource` has no debounce.** A source change that yields a
   byte-identical URL still issues a second request, because the resource
   re-reads its request function whenever a signal it depends on changes.
6. **`debounced` fixes that, and is measured rather than assumed.** Four
   keystrokes typed with a gap between them put four requests in the log; the
   same four typed into the debounced box put nothing in the log while the
   window is open and one request for the final term once it closes. The test
   hands `debounced` a promise it resolves by hand instead of a number of
   milliseconds, so the window is a gate rather than a sleep.

## Versions

Angular 22.1.6, TypeScript 6.0.3, `@angular/cli` and `@angular/build` 22.1.8,
zoneless, tested on Node 26.1.0 on Windows 11. The unit tests run under the
Angular 22 `unit-test` builder with the Vitest 4.1.11 runner in a Node + jsdom
27.4.0 environment, against a real local socket rather than a mocked backend. On
the XHR path the calls go through jsdom's `XMLHttpRequest`; on the default path
they go through Node's own built-in `fetch` (undici 8.2.0), which jsdom leaves
in place rather than replacing, so that path exercises undici and not a
browser's network stack. None of it has been repeated in a real browser.

`httpResource` is public API as of Angular 22.0; its declaration in
`@angular/common@22.1.6` carries `@publicApi 22.0`. `debounced` is newer and its
declaration in `@angular/core@22.1.6` carries `@experimental 22.0`.

MIT license.
