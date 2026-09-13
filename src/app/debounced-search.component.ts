import {
  ChangeDetectionStrategy,
  Component,
  DebounceTimer,
  InjectionToken,
  computed,
  debounced,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { httpResource } from '@angular/common/http';

import { SEARCH_BASE, SearchResponse, searchUrl } from './search-api';

/**
 * How long `debounced` waits before letting a new term through. A plain number
 * of milliseconds in the app; the tests replace it with a promise they resolve
 * by hand, so the debounce window is a controlled gate rather than a sleep.
 */
export const DEBOUNCE_WAIT = new InjectionToken<DebounceTimer<string>>('DEBOUNCE_WAIT', {
  providedIn: 'root',
  factory: () => 300,
});

/**
 * The same search box, with `debounced` between the typed term and the resource.
 * `debounced` is marked `@experimental 22.0` in `@angular/core@22.1.6`; it
 * returns a `Resource`, so the request function reads `.value()` rather than the
 * signal itself.
 */
@Component({
  selector: 'app-debounced-search',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section>
      <h2>httpResource + debounced</h2>
      <input
        type="text"
        aria-label="debounced search"
        [value]="term()"
        (input)="type($any($event.target).value)"
      />
      <p data-testid="status">status: {{ results.status() }}</p>
      <p data-testid="shown">showing: {{ shown() }}</p>
    </section>
  `,
})
export class DebouncedSearchComponent {
  private readonly base = inject(SEARCH_BASE);

  /** term -> how long the server should take to answer it, in ms. */
  readonly delays = input<Record<string, number>>({});

  readonly term = signal('');

  /** The term as the resource sees it: only after the typing has stopped. */
  readonly settled = debounced(() => this.term(), inject(DEBOUNCE_WAIT));

  readonly results = httpResource<SearchResponse>(() => {
    const term = this.settled.value()?.trim();
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
