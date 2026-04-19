import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeEnGb from '@angular/common/locales/en-GB';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// `number` / `date` pipes need CLDR data for any locale id passed explicitly (e.g. `I18nService.numberLocale()`).
registerLocaleData(localeDe, 'de-DE');
registerLocaleData(localeEnGb, 'en-EU');

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
