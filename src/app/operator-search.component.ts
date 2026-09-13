import { Component, DestroyRef, OnInit, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, mergeMap, switchMap } from 'rxjs';

import { SEARCH_BASE, SearchResponse, searchUrl } from './search-api';

export type SearchOperator = 'switchMap' | 'mergeMap';

/**
 * The hand-rolled fix, both ways round. switchMap unsubscribes from the
 * previous inner observable, which aborts the request underneath it. mergeMap
 * lets every request run to completion, so the stale answer still wins — which
 * is why "I used a flattening operator" is not the same as "I fixed the race".
 */
@Component({
  selector: 'app-operator-search',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section>
      <h2>{{ operator() }}</h2>
      <input
        type="text"
        [attr.aria-label]="operator() + ' search'"
        [value]="term()"
        (input)="type($any($event.target).value)"
      />
      <p data-testid="shown">showing: {{ shown() }}</p>
    </section>
  `,
})
export class OperatorSearchComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly base = inject(SEARCH_BASE);
  private readonly destroyRef = inject(DestroyRef);
  private readonly typed = new Subject<string>();

  readonly operator = input<SearchOperator>('switchMap');

  /** term -> how long the server should take to answer it, in ms. */
  readonly delays = input<Record<string, number>>({});

  readonly term = signal('');
  readonly shown = signal('(nothing)');

  /** Every value the template's `shown` binding has taken, in order. */
  readonly renderLog: string[] = ['(nothing)'];

  ngOnInit(): void {
    const request = (term: string): Observable<SearchResponse> =>
      this.http.get<SearchResponse>(searchUrl(this.base, term, this.delays()[term] ?? 0));

    const flatten = this.operator() === 'switchMap' ? switchMap(request) : mergeMap(request);

    this.typed
      .pipe(flatten, takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        this.shown.set(response.term);
        this.renderLog.push(response.term);
      });
  }

  type(value: string): void {
    this.term.set(value);
    const term = value.trim();
    if (!term) {
      this.shown.set('(nothing)');
      this.renderLog.push('(nothing)');
      return;
    }
    this.typed.next(term);
  }
}
