import { HttpClient, provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { NaiveSearchComponent } from './naive-search.component';
import { OperatorSearchComponent } from './operator-search.component';
import { ResourceSearchComponent } from './resource-search.component';
import { SEARCH_BASE } from './search-api';

const BASE = 'http://127.0.0.1:8931';

/**
 * "an" is typed FIRST and answers LAST. That ordering is the whole point: a
 * test where the newest request also happens to be the quickest proves nothing
 * about cancellation, because the right answer would win either way.
 */
const DELAYS: Record<string, number> = { an: 600, ang: 50 };

/** Long enough for the first request to be on the wire, far short of 600ms. */
const KEYSTROKE_GAP_MS = 150;

/** Comfortably past the moment the first request would have answered. */
const SETTLE_MS = 900;

interface RequestRecord {
  seq: number;
  term: string;
  delayMs: number;
  startedAt: number;
  endedAt: number | null;
  aborted: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function configure(): void {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), { provide: SEARCH_BASE, useValue: BASE }],
  });
}

async function resetServerLog(): Promise<void> {
  await firstValueFrom(TestBed.inject(HttpClient).post(`${BASE}/reset`, {}));
}

async function serverLog(): Promise<RequestRecord[]> {
  const body = await firstValueFrom(
    TestBed.inject(HttpClient).get<{ requests: RequestRecord[] }>(`${BASE}/report`),
  );
  return body.requests;
}

function shownText(fixture: ComponentFixture<unknown>): string {
  const el = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="shown"]');
  return el?.textContent ?? '';
}

function only(log: RequestRecord[], term: string): RequestRecord {
  const matches = log.filter((r) => r.term === term);
  expect(matches, `expected exactly one request for "${term}"`).toHaveLength(1);
  return matches[0] as RequestRecord;
}

describe('a keystroke that lands while the previous request is still in flight', () => {
  beforeAll(async () => {
    const response = await fetch(`${BASE}/health`).catch(() => null);
    if (!response || !response.ok) {
      throw new Error(
        `The recording server is not answering on ${BASE}. ` +
          `Run "npm run check", or start it yourself with "npm run server".`,
      );
    }
  });

  beforeEach(() => {
    configure();
  });

  it('httpResource: the abandoned request never reaches the view', async () => {
    await resetServerLog();

    const fixture = TestBed.createComponent(ResourceSearchComponent);
    fixture.componentRef.setInput('delays', DELAYS);
    const component = fixture.componentInstance;
    TestBed.tick();

    component.type('an');
    TestBed.tick();
    await sleep(KEYSTROKE_GAP_MS);

    component.type('ang');
    TestBed.tick();
    await sleep(SETTLE_MS);
    TestBed.tick();

    expect(component.renderLog).not.toContain('an');
    expect(component.renderLog.at(-1)).toBe('ang');
    expect(shownText(fixture)).toContain('showing: ang');
  });

  it('httpResource: the abort reaches the server, which stops early', async () => {
    await resetServerLog();

    const fixture = TestBed.createComponent(ResourceSearchComponent);
    fixture.componentRef.setInput('delays', DELAYS);
    const component = fixture.componentInstance;
    TestBed.tick();

    component.type('an');
    TestBed.tick();
    await sleep(KEYSTROKE_GAP_MS);

    component.type('ang');
    TestBed.tick();
    await sleep(SETTLE_MS);

    const log = await serverLog();
    const search = log.filter((r) => r.term === 'an' || r.term === 'ang');
    expect(search).toHaveLength(2);

    const first = only(log, 'an');
    const second = only(log, 'ang');

    // The server saw the connection close before it wrote a response.
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);

    // And it closed early rather than after the full 600ms it was asked for.
    expect(first.endedAt).not.toBeNull();
    expect(first.endedAt! - first.startedAt).toBeLessThan(first.delayMs);
  });

  it('plain subscribe: the same timings put the stale answer on screen', async () => {
    await resetServerLog();

    const fixture = TestBed.createComponent(NaiveSearchComponent);
    fixture.componentRef.setInput('delays', DELAYS);
    const component = fixture.componentInstance;
    TestBed.tick();

    component.type('an');
    TestBed.tick();
    await sleep(KEYSTROKE_GAP_MS);

    component.type('ang');
    TestBed.tick();
    await sleep(SETTLE_MS);
    TestBed.tick();

    // The newest answer arrived first and was then overwritten by the oldest.
    expect(component.renderLog).toEqual(['(nothing)', 'ang', 'an']);
    expect(shownText(fixture)).toContain('showing: an');

    const log = await serverLog();
    const first = only(log, 'an');
    const second = only(log, 'ang');

    expect(first.aborted).toBe(false);
    expect(second.aborted).toBe(false);
    expect(first.endedAt! - first.startedAt).toBeGreaterThanOrEqual(first.delayMs);
    expect(first.endedAt!).toBeGreaterThan(second.endedAt!);
  });

  it('switchMap: the hand-rolled fix aborts the same request httpResource does', async () => {
    await resetServerLog();

    const fixture = TestBed.createComponent(OperatorSearchComponent);
    fixture.componentRef.setInput('operator', 'switchMap');
    fixture.componentRef.setInput('delays', DELAYS);
    const component = fixture.componentInstance;
    TestBed.tick();

    component.type('an');
    TestBed.tick();
    await sleep(KEYSTROKE_GAP_MS);

    component.type('ang');
    TestBed.tick();
    await sleep(SETTLE_MS);
    TestBed.tick();

    expect(component.renderLog).toEqual(['(nothing)', 'ang']);
    expect(shownText(fixture)).toContain('showing: ang');

    const log = await serverLog();
    expect(only(log, 'an').aborted).toBe(true);
    expect(only(log, 'ang').aborted).toBe(false);
  });

  it('mergeMap: an operator that is not switchMap leaves the race exactly where it was', async () => {
    await resetServerLog();

    const fixture = TestBed.createComponent(OperatorSearchComponent);
    fixture.componentRef.setInput('operator', 'mergeMap');
    fixture.componentRef.setInput('delays', DELAYS);
    const component = fixture.componentInstance;
    TestBed.tick();

    component.type('an');
    TestBed.tick();
    await sleep(KEYSTROKE_GAP_MS);

    component.type('ang');
    TestBed.tick();
    await sleep(SETTLE_MS);
    TestBed.tick();

    expect(component.renderLog).toEqual(['(nothing)', 'ang', 'an']);
    expect(shownText(fixture)).toContain('showing: an');

    const log = await serverLog();
    expect(only(log, 'an').aborted).toBe(false);
    expect(only(log, 'ang').aborted).toBe(false);
  });

  it('httpResource: a source change that produces the same URL still refetches', async () => {
    await resetServerLog();

    const fixture = TestBed.createComponent(ResourceSearchComponent);
    fixture.componentRef.setInput('delays', { ang: 20 });
    const component = fixture.componentInstance;
    TestBed.tick();

    component.type('ang');
    TestBed.tick();
    await sleep(200);

    // Same trimmed term, same URL, different signal value.
    component.type('ang ');
    TestBed.tick();
    await sleep(200);

    const log = await serverLog();
    expect(log.filter((r) => r.term === 'ang')).toHaveLength(2);
  });
});
