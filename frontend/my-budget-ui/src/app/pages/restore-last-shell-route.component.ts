import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { LastShellRouteService } from '../core/last-shell-route.service';

/** Resolves `/` to the last primary nav area (or dashboard when nothing is stored). */
@Component({
  selector: 'app-restore-last-shell-route',
  standalone: true,
  template: ''
})
export class RestoreLastShellRouteComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly lastShellRoute = inject(LastShellRouteService);

  ngOnInit(): void {
    const segment = this.lastShellRoute.getRestoreSegment();
    void this.router.navigateByUrl(`/${segment}`, { replaceUrl: true });
  }
}
