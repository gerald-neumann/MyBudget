import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, forkJoin } from 'rxjs';
import { BaselineInvitation, BaselineMember } from './core/budget.models';
import { ApiBuildInfoDto, BudgetApiService } from './core/budget-api.service';
import { BudgetStateService } from './core/budget-state.service';
import { I18nService } from './core/i18n.service';
import { KeycloakAuthService } from './core/keycloak-auth.service';
import { APP_BUILD_TIMESTAMP_UTC, APP_VERSION } from './app-version';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html'
})
export class App {
  private readonly api = inject(BudgetApiService);
  readonly state = inject(BudgetStateService);
  readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly keycloakAuth = inject(KeycloakAuthService);
  readonly appVersion = APP_VERSION;
  readonly appBuildTimestampUtc = APP_BUILD_TIMESTAMP_UTC;
  readonly apiBuildInfo = signal<ApiBuildInfoDto | null>(null);

  /** Avoid /me + /baselines while Keycloak is on but there is no session (e.g. /sign-in-failed). */
  private shellPrimed = false;

  readonly userMenuOpen = signal(false);
  readonly userMenuPanelId = 'app-user-menu-panel';
  readonly currentUserDisplayName = signal('');

  newBaselineModalOpen = false;
  newBaselineModalName = '';
  invitationToken = '';

  readonly sharingModalOpen = signal(false);
  sharingModalError = '';
  shareRole: 'Viewer' | 'Editor' = 'Viewer';
  shareLinkToken = '';
  invitations: BaselineInvitation[] = [];
  members: BaselineMember[] = [];

  readonly sentInvitationsModalOpen = signal(false);
  sentInvitations: BaselineInvitation[] = [];
  sentInvitationsError = '';

  renameBaselineModalOpen = false;
  renameBaselineName = '';
  renameBaselineError = '';

  /** Toggled off/on so the primary router outlet remounts after a household change (full page reload for the current route). */
  readonly routeOutletMounted = signal(true);

  constructor() {
    this.api
      .getApiBuildInfo()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((info) => this.apiBuildInfo.set(info));
    this.primeShellDataWhenAllowed();
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.primeShellDataWhenAllowed());
  }

  private primeShellDataWhenAllowed(): void {
    if (this.shellPrimed) {
      return;
    }
    if (this.keycloakAuth.usesKeycloakAuth() && !this.keycloakAuth.isAuthenticated()) {
      return;
    }
    this.shellPrimed = true;
    this.loadShellUserAndBaselines();
  }

  private loadShellUserAndBaselines(): void {
    this.reloadBaselines();
    this.api
      .getMe()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (me) => this.currentUserDisplayName.set(me.displayName?.trim() || ''),
        error: () => this.currentUserDisplayName.set('')
      });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.userMenuOpen()) {
      this.userMenuOpen.set(false);
    }
  }

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.userMenuOpen.update((open) => !open);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  openNewBaselineFromMenu(): void {
    this.closeUserMenu();
    this.openNewBaselineModal();
  }

  forkFromMenu(): void {
    this.forkSelectedBaseline();
    this.closeUserMenu();
  }

  acceptInvitationFromMenu(): void {
    this.acceptInvitationToken();
  }

  openSharingModalFromMenu(): void {
    this.closeUserMenu();
    this.openSharingModal();
  }

  openSentInvitationsFromMenu(): void {
    this.closeUserMenu();
    this.sentInvitationsError = '';
    this.sentInvitationsModalOpen.set(true);
    this.loadSentInvitations();
  }

  openHelpFromMenu(): void {
    this.closeUserMenu();
    void this.router.navigate(['/help']);
  }

  logoutFromMenu(): void {
    this.closeUserMenu();
    void this.keycloakAuth.logout();
  }

  closeSentInvitationsModal(): void {
    this.sentInvitationsModalOpen.set(false);
    this.sentInvitationsError = '';
  }

  openRenameBaselineFromMenu(): void {
    this.closeUserMenu();
    const selected = this.state.selectedBaseline();
    if (!selected || selected.myAccess !== 'Owner') {
      return;
    }
    this.renameBaselineError = '';
    this.renameBaselineName = selected.name;
    this.renameBaselineModalOpen = true;
  }

  closeRenameBaselineModal(): void {
    this.renameBaselineModalOpen = false;
    this.renameBaselineName = '';
    this.renameBaselineError = '';
  }

  saveRenamedBaseline(): void {
    const selected = this.state.selectedBaseline();
    const name = this.renameBaselineName.trim();
    if (!selected || selected.myAccess !== 'Owner' || !name) {
      return;
    }

    this.api
      .updateBaseline(selected.id, { name, status: selected.status })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.closeRenameBaselineModal();
          this.reloadBaselines(selected.id);
        },
        error: () => {
          this.renameBaselineError = this.i18n.t('app.renameBaselineFailed');
        }
      });
  }

  setSelectedBaselineAsDefault(): void {
    this.closeUserMenu();
    const selected = this.state.selectedBaseline();
    if (!selected || selected.myAccess !== 'Owner' || selected.isPrimaryBudget || selected.isSampleDemo) {
      return;
    }

    this.api
      .updateBaseline(selected.id, { isPrimaryBudget: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reloadBaselines(selected.id),
        error: () => {
          /* surface minimally: list will stay consistent on next load */
        }
      });
  }

  openSharingModal(): void {
    this.sharingModalError = '';
    this.shareLinkToken = '';
    this.sharingModalOpen.set(true);
    const baselineId = this.state.selectedBaselineId();
    if (baselineId && this.isOwnerOfSelectedBaseline()) {
      this.loadSharingDetails(baselineId);
    } else {
      this.invitations = [];
      this.members = [];
    }
  }

  closeSharingModal(): void {
    this.sharingModalOpen.set(false);
    this.sharingModalError = '';
    this.shareLinkToken = '';
  }

  isOwnerOfSelectedBaseline(): boolean {
    return this.state.selectedBaseline()?.myAccess === 'Owner';
  }

  createShareInvitation(): void {
    const baselineId = this.state.selectedBaselineId();
    if (!baselineId || !this.isOwnerOfSelectedBaseline()) {
      return;
    }

    this.api
      .createBaselineInvitation(baselineId, { role: this.shareRole })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.shareLinkToken = response.token;
          this.loadSharingDetails(baselineId);
        },
        error: () => {
          this.sharingModalError = this.i18n.t('app.sharingLoadFailed');
        }
      });
  }

  copyShareToken(): void {
    if (!this.shareLinkToken || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(this.shareLinkToken).catch(() => {
      this.sharingModalError = this.i18n.t('app.sharingCopyFailed');
    });
  }

  updateMemberRole(member: BaselineMember, role: 'Viewer' | 'Editor'): void {
    const baselineId = this.state.selectedBaselineId();
    if (!baselineId || !this.isOwnerOfSelectedBaseline() || member.role === role) {
      return;
    }

    this.api
      .updateBaselineMemberRole(baselineId, member.userId, role)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.members = this.members.map((item) => (item.userId === updated.userId ? updated : item));
        },
        error: () => {
          this.sharingModalError = this.i18n.t('app.sharingLoadFailed');
        }
      });
  }

  removeMember(memberUserId: string): void {
    const baselineId = this.state.selectedBaselineId();
    if (!baselineId || !this.isOwnerOfSelectedBaseline()) {
      return;
    }

    this.api
      .removeBaselineMember(baselineId, memberUserId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.members = this.members.filter((item) => item.userId !== memberUserId);
        },
        error: () => {
          this.sharingModalError = this.i18n.t('app.sharingLoadFailed');
        }
      });
  }

  revokeInvitation(invitationId: string): void {
    const baselineId = this.state.selectedBaselineId();
    if (!baselineId || !this.isOwnerOfSelectedBaseline()) {
      return;
    }

    this.api
      .revokeBaselineInvitation(baselineId, invitationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.invitations = this.invitations.filter((item) => item.id !== invitationId);
        },
        error: () => {
          this.sharingModalError = this.i18n.t('app.sharingLoadFailed');
        }
      });
  }

  revokeSentInvitation(invitation: BaselineInvitation): void {
    if (invitation.revokedAt || invitation.consumedAt) {
      return;
    }

    this.api
      .revokeBaselineInvitation(invitation.baselineId, invitation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadSentInvitations(),
        error: () => {
          this.sentInvitationsError = this.i18n.t('app.sharingLoadFailed');
        }
      });
  }

  private loadSentInvitations(): void {
    this.api
      .getSentBaselineInvitations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.sentInvitations = rows;
        },
        error: () => {
          this.sentInvitations = [];
          this.sentInvitationsError = this.i18n.t('app.sharingLoadFailed');
        }
      });
  }

  /** For invitations you sent: pending link, accepted (shows name), expired without accept, or revoked. */
  inviteEffectiveStatus(inv: BaselineInvitation): 'revoked' | 'accepted' | 'expired' | 'pending' {
    if (inv.revokedAt) {
      return 'revoked';
    }
    if (inv.consumedAt) {
      return 'accepted';
    }
    if (new Date(inv.expiresAt).getTime() < Date.now()) {
      return 'expired';
    }
    return 'pending';
  }

  inviteStatusLabelKey(inv: BaselineInvitation): string {
    const s = this.inviteEffectiveStatus(inv);
    if (s === 'revoked') {
      return 'app.inviteStatusRevoked';
    }
    if (s === 'accepted') {
      return 'app.inviteStatusAccepted';
    }
    if (s === 'expired') {
      return 'app.inviteStatusExpired';
    }
    return 'app.inviteStatusPending';
  }

  private loadSharingDetails(baselineId: string): void {
    forkJoin({
      invitations: this.api.getBaselineInvitations(baselineId),
      members: this.api.getBaselineMembers(baselineId)
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.invitations = response.invitations.filter((inv) => !inv.revokedAt);
          this.members = response.members;
        },
        error: () => {
          this.invitations = [];
          this.members = [];
          this.sharingModalError = this.i18n.t('app.sharingLoadFailed');
        }
      });
  }

  openNewBaselineModal(): void {
    this.newBaselineModalName = '';
    this.newBaselineModalOpen = true;
  }

  closeNewBaselineModal(): void {
    this.newBaselineModalOpen = false;
    this.newBaselineModalName = '';
  }

  confirmNewBaseline(): void {
    const name = this.newBaselineModalName.trim();
    if (!name) {
      return;
    }

    this.api
      .createBaseline({ name, status: 'Draft' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.closeNewBaselineModal();
        this.reloadBaselines();
      });
  }

  forkSelectedBaseline(): void {
    const selected = this.state.selectedBaseline();
    if (!selected || selected.myAccess !== 'Owner') {
      return;
    }

    this.api
      .forkBaseline(selected.id, { name: `${this.i18n.translateBaselineDisplayName(selected.name)} (${this.i18n.t('app.forkSelected')})` })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reloadBaselines());
  }

  acceptInvitationToken(): void {
    const token = this.invitationToken.trim();
    if (!token) {
      return;
    }

    this.api
      .acceptInvitation(token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.invitationToken = '';
          this.closeUserMenu();
          this.reloadBaselines(response.baselineId);
        }
      });
  }

  t(key: string): string {
    return this.i18n.t(key);
  }

  onToolbarBaselineSelect(baselineId: string): void {
    if (!baselineId || baselineId === this.state.selectedBaselineId()) {
      return;
    }
    this.state.selectBaseline(baselineId);
    this.remountRouteOutlet();
  }

  private remountRouteOutlet(): void {
    this.routeOutletMounted.set(false);
    queueMicrotask(() => this.routeOutletMounted.set(true));
  }

  private reloadBaselines(selectBaselineId?: string): void {
    this.api
      .getBaselines()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (baselines) => {
          this.state.setBaselines(baselines);
          if (selectBaselineId && baselines.some((b) => b.id === selectBaselineId)) {
            this.state.selectBaseline(selectBaselineId);
          }
        },
        error: () => this.state.setBaselines([])
      });
  }
}
