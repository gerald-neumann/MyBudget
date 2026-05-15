import { Component, inject } from '@angular/core';

import { I18nService } from '../core/i18n.service';

@Component({
  selector: 'app-help-page',
  imports: [],
  templateUrl: './help-page.component.html',
  styleUrl: './help-page.component.css'
})
export class HelpPageComponent {
  readonly i18n = inject(I18nService);

  t(key: string): string {
    return this.i18n.t(key);
  }
}
