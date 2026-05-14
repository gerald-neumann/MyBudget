import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiBuildInfoDto, BudgetApiService } from '../core/budget-api.service';
import { I18nService } from '../core/i18n.service';
import { APP_BUILD_TIMESTAMP_UTC, APP_VERSION } from '../app-version';

@Component({
  selector: 'app-help-page',
  imports: [CommonModule],
  templateUrl: './help-page.component.html',
  styleUrl: './help-page.component.css'
})
export class HelpPageComponent {
  readonly i18n = inject(I18nService);
  readonly appVersion = APP_VERSION;
  readonly appBuildTimestampUtc = APP_BUILD_TIMESTAMP_UTC;
  readonly apiBuild$: Observable<ApiBuildInfoDto> = inject(BudgetApiService).getApiBuildInfo();

  t(key: string): string {
    return this.i18n.t(key);
  }
}
