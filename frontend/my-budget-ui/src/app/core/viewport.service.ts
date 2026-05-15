import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

/** Matches Tailwind `sm` breakpoint (640px): true when layout should use compact mobile chrome. */
const MAX_SM_MEDIA = '(max-width: 639.99px)';

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly platformId = inject(PLATFORM_ID);

  /** Viewport width at most `sm` − 1 (Tailwind `max-sm`). */
  readonly maxSm = signal(false);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const mq = window.matchMedia(MAX_SM_MEDIA);
    const apply = () => this.maxSm.set(mq.matches);
    apply();
    mq.addEventListener('change', apply);
  }
}
