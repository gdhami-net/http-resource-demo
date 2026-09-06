import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';

import { SEARCH_BASE, SearchResponse, searchUrl } from './search-api';

/**
 * Search-as-you-type with httpResource. There is no operator and no
 * subscription: the resource reads `term`, so setting `term` is what starts a
 * request, and starting a request is what aborts the previous one.
 */
@Component({
  selector: 'app-resource-search',
  template: `
    <section>
      <h2>httpResource</h2>
      <input
        type="text"
        aria-label="httpResource search"
        [value]="term()"
        (input)="type($any($event.target).value)"
      />
      <p data-testid="status">status: {{ results.status() }}</p>
      <p data-testid="shown">showing: {{ shown() }}</p>
    </section>
  `,
})
export class ResourceSearchComponent {
  private readonly base = inject(SEARCH_BASE);

  /** term -> how long the server should take to answer it, in ms. */
  readonly delays = input<Record<string, number>>({});

  readonly term = signal('');

  readonly results = httpResource<SearchResponse>(() => {
    const term = this.term().trim();
    if (!term) {
      return undefined;
    }
    return searchUrl(this.base, term, this.delays()[term] ?? 0);
  });

  readonly shown = computed(() => this.results.value()?.term ?? '(nothing)');

  /** Every value the template's `shown` binding has taken, in order. */
  readonly renderLog: string[] = [];

  constructor() {
    effect(() => {
      this.renderLog.push(this.shown());
    });
  }

  type(value: string): void {
    this.term.set(value);
  }
}
