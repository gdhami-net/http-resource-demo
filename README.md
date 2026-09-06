# http-resource-demo

Companion repo for the post **"The request that cancels itself"**
([gdhami.net](https://gdhami.net) — link added when the post is live).

Four search boxes, one backend, one race. The backend is a 120-line Node server
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
| `httpResource` | `ang` | aborted after ~166ms of the 600ms it was asked for |
| `switchMap` | `ang` | aborted |
| `mergeMap` | `an` | answered in full, 600ms |
| plain `.subscribe()` | `an` | answered in full, 600ms |

The two failing rows are the bug: the stale answer for `an` lands last and
overwrites the correct answer for `ang`. `mergeMap` is in there because reaching
for a flattening operator is not the same as fixing the race.

A real `/report` payload from the `httpResource` run:

```json
{"requests":[
  {"seq":0,"term":"an","delayMs":600,"startedAt":3429,"endedAt":3595,"aborted":true},
  {"seq":1,"term":"ang","delayMs":50,"startedAt":3595,"endedAt":3656,"aborted":false}
]}
```

`an` was cut off at 3595ms — 166ms into a 600ms wait, and the same millisecond
`ang` started. The abort happens before the replacement request goes out, not
after.

## Run it

```bash
npm install
npm run check
```

`npm run check` starts the recording server on 127.0.0.1:8931, runs the Angular
unit-test target against it, and shuts the server down again. Nothing else is
needed; the tests are the assertions.

```
 ✓ httpResource: the abandoned request never reaches the view
 ✓ httpResource: the abort reaches the server, which stops early
 ✓ plain subscribe: the same timings put the stale answer on screen
 ✓ switchMap: the hand-rolled fix aborts the same request httpResource does
 ✓ mergeMap: an operator that is not switchMap leaves the race exactly where it was
 ✓ httpResource: a source change that produces the same URL still refetches

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

To poke at it by hand instead:

```bash
npm run server        # terminal 1
npm start             # terminal 2, then open http://localhost:4200
```

Type `an`, then immediately `ang`, in each of the four boxes, and read
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
4. **`httpResource` has no debounce.** A source change that yields a byte-identical
   URL still issues a second request, because the resource re-reads its request
   function whenever a signal it depends on changes.

## Versions

Angular 21.2.22 (the v21 LTS line), TypeScript 5.9.3, zoneless, tested on Node
26.1.0 on Windows 11. The unit tests run under the Angular 21 `unit-test`
builder with the Vitest runner in a Node + jsdom environment, so the HTTP calls
are jsdom's `XMLHttpRequest` against a real local socket, not a mocked backend.
`provideHttpClient()` is used with no `withFetch()`, so this is the XHR backend;
I have not repeated the measurements under `withFetch()` or in a real browser.

In Angular 21 `httpResource` is marked `@experimental` in its own type
definitions. It became public API in Angular 22.0.

MIT license.
