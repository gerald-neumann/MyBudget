import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { LastShellRouteService } from './last-shell-route.service';

/** Redirects `/` to the last primary nav area before any shell route component mounts. */
export const restoreLastShellRouteGuard: CanActivateFn = () => {
  const router = inject(Router);
  const segment = inject(LastShellRouteService).getRestoreSegment();
  return router.createUrlTree(['/', segment]);
};
