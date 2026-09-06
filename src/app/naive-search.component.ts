import { Component, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { SEARCH_BASE, SearchResponse, searchUrl } from './search-api';

/**
 * The same screen written the way most search boxes are still written: one
 * subscribe per keystroke, no switching operator. Nothing cancels anything, so
 * whichever response is last to arrive is the one on screen.
 */
@Component({
  selector: 'app-naive-search',
  template: `
    <section>
      <h2>plain subscribe</h2>
      <input
        type="text"
        aria-label="naive search"
        [value]="term()"
        (input)="type($any($event.target).value)"
      />
      <p data-testid="shown">showing: {{ shown() }}</p>
    </section>
  `,
})
export class NaiveSearchComponent {
  private readonly http = inject(HttpClient);
  private readonly base = inject(SEARCH_BASE);

  /** term -> how long the server should take to answer it, in ms. */
  readonly delays = input<Record<string, number>>({});

  readonly term = signal('');
  readonly shown = signal('(nothing)');

  /** Every value the template's `shown` binding has taken, in order. */
  readonly renderLog: string[] = ['(nothing)'];

  type(value: string): void {
    this.term.set(value);
    const term = value.trim();
    if (!term) {
      this.shown.set('(nothing)');
      this.renderLog.push('(nothing)');
      return;
    }
    this.http
      .get<SearchResponse>(searchUrl(this.base, term, this.delays()[term] ?? 0))
      .subscribe((response) => {
        this.shown.set(response.term);
        this.renderLog.push(response.term);
      });
  }
}
