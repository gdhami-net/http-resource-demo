import { Component } from '@angular/core';

import { NaiveSearchComponent } from './naive-search.component';
import { OperatorSearchComponent } from './operator-search.component';
import { ResourceSearchComponent } from './resource-search.component';

/**
 * The same search box four ways, all pointed at the same recording server.
 * Type "an", then immediately "ang": the server answers "an" after 600ms and
 * "ang" after 50ms, so the older answer always arrives last.
 */
@Component({
  selector: 'app-root',
  imports: [ResourceSearchComponent, OperatorSearchComponent, NaiveSearchComponent],
  template: `
    <h1>httpResource, switchMap, mergeMap, and a plain subscribe</h1>
    <p>
      Start the recording server with <code>npm run server</code> first, then
      type <code>an</code> and immediately <code>ang</code> into each box.
    </p>
    <div class="panes">
      <app-resource-search [delays]="delays" />
      <app-operator-search operator="switchMap" [delays]="delays" />
      <app-operator-search operator="mergeMap" [delays]="delays" />
      <app-naive-search [delays]="delays" />
    </div>
    <p>
      Server log: <a href="http://127.0.0.1:8931/report">/report</a> — the
      <code>aborted</code> flag is set on requests whose connection closed
      before the server had written a response.
    </p>
  `,
  styles: `
    :host { display: block; font-family: system-ui, sans-serif; padding: 24px; }
    .panes { display: flex; gap: 40px; flex-wrap: wrap; }
    section { min-width: 240px; }
  `,
})
export class AppComponent {
  readonly delays: Record<string, number> = { an: 600, ang: 50 };
}
