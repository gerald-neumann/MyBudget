import { Component } from '@angular/core';

/** Fallback shell for `/` when the restore guard does not redirect (should not happen). */
@Component({
  selector: 'app-restore-last-shell-route',
  standalone: true,
  template: ''
})
export class RestoreLastShellRouteComponent {}
