import { CommonModule, formatDate } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Component, DestroyRef, computed, effect, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, forkJoin, timer } from 'rxjs';
import { BaselineInvitation, BaselineMember } from './core/budget.models';
import { ApiBuildInfoDto, BudgetApiService } from './core/budget-api.service';
import { BudgetStateService } from './core/budget-state.service';
import { isResolvedApiBaseRemoteHost } from './core/api-base-url';
import { I18nService } from './core/i18n.service';
import { KeycloakAuthService } from './core/keycloak-auth.service';
import { SessionExpiredUiService } from './core/session-expired-ui.service';
import { ThemeService } from './core/theme.service';
import {
  confirmDiscardUnsavedChanges,
  isKeyboardCancel,
  shouldKeyboardCancelFromTarget,
  shouldKeyboardConfirmForModal
} from './core/keyboard-confirm-cancel';
import { APP_BUILD_TIMESTAMP_UTC, APP_VERSION } from './app-version';
import { ViewportService } from './core/viewport.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly api = inject(BudgetApiService);
  private readonly title = inject(Title);
  readonly state = inject(BudgetStateService);
  readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly keycloakAuth = inject(KeycloakAuthService);
  readonly sessionExpiredUi = inject(SessionExpiredUiService);
  readonly theme = inject(ThemeService);
  readonly viewport = inject(ViewportService);
  readonly appVersion = APP_VERSION;
  readonly appBuildTimestampUtc = APP_BUILD_TIMESTAMP_UTC;
  readonly apiBuildInfo = signal<ApiBuildInfoDto | null>(null);

  readonly appInfoModalOpen = signal(false);
  copyVersionInfoError = '';

  /** Plain multi-line text copied by “Copy details” (matches on-screen build info). */
  readonly versionInfoClipboardText = computed(() => {
    void this.i18n.language();
    const api = this.apiBuildInfo();
    const loc = this.i18n.language() === 'de' ? 'de' : 'en';
    const lines: string[] = [];
    lines.push(`${this.i18n.t('help.uiVersionLabel')}: v${this.appVersion}`);
    lines.push(
      `${this.i18n.t('help.uiBuildLabel')}: ${formatDate(this.appBuildTimestampUtc, 'medium', loc, 'UTC')} (UTC)`
    );
    if (api?.version) {
      lines.push(`${this.i18n.t('help.apiVersionLabel')}: v${api.version}`);
      if (api.buildTimestampUtc) {
        lines.push(
          `${this.i18n.t('help.apiBuildLabel')}: ${formatDate(api.buildTimestampUtc, 'medium', loc, 'UTC')} (UTC)`
        );
      } else {
        lines.push(`${this.i18n.t('help.apiBuildLabel')}: ${this.i18n.t('help.apiBuildUnknown')}`);
      }
    } else {
      lines.push(`${this.i18n.t('help.apiVersionLabel')}: ${this.i18n.t('help.apiBuildUnavailable')}`);
    }
    return lines.join('\n');
  });

  /** First path segment for primary shell area (browser tab title only; nav + page show current area). */
  private readonly shellRouteSegment = signal<string>('dashboard');

  /** Product name in the shell header (nav shows the active area). */
  readonly shellHeaderTitle = computed(() => {
    void this.i18n.language();
    return this.i18n.t('app.title');
  });

  /** Page name prefix for `document.title` (e.g. `Dashboard · My Budget`). */
  private readonly browserTabSectionTitle = computed(() => {
    void this.i18n.language();
    switch (this.shellRouteSegment()) {
      case 'dashboard':
        return this.i18n.t('app.dashboard');
      case 'budget':
        return this.i18n.t('app.nav.budgets');
      case 'actuals':
        return this.i18n.t('app.nav.actuals');
      case 'accounts':
        return this.i18n.t('app.accounts');
      case 'help':
        return this.i18n.t('app.sectionHelp');
      default:
        return this.i18n.t('app.title');
    }
  });

  /** Avoid /me + /baselines while Keycloak is on but there is no session (e.g. /sign-in-failed). */
  private shellPrimed = false;

  /** True until the first shell `getBaselines()` after auth/config settles (hides route pages until workspace is usable). */
  readonly shellBootstrapLoading = signal(false);

  readonly userMenuOpen = signal(false);
  readonly userMenuPanelId = 'app-user-menu-panel';
  readonly workspaceMenuOpen = signal(false);
  readonly workspaceMenuPanelId = 'app-workspace-menu-panel';
  readonly accessMenuOpen = signal(false);
  readonly accessMenuPanelId = 'app-access-menu-panel';
  /** Full-screen / drawer shell menu for compact viewports (baseline, nav, workspace, access, account). */
  readonly mobileAppMenuOpen = signal(false);
  readonly currentUserDisplayName = signal('');
  /** Countdown until access-token `exp` (Keycloak); refreshed every second while authenticated. */
  readonly sessionValidityText = signal('');

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
  private renameBaselineOriginalName = '';
  renameBaselineError = '';

  /** Toggled off/on so the primary router outlet remounts after a household change (full page reload for the current route). */
  readonly routeOutletMounted = signal(true);

  /** Tiles for the diagonal sample watermark grid (decorative only). */
  readonly sampleWatermarkTiles = Array.from({ length: 36 }, (_, i) => i);

  constructor() {
    this.syncShellRouteFromRouter();
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
      .subscribe(() => {
        this.primeShellDataWhenAllowed();
        this.closeMobileShellMenu();
        this.syncShellRouteFromRouter();
      });

    timer(0, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshSessionValidityLabel());

    effect(() => {
      if (!this.viewport.maxSm()) {
        this.mobileAppMenuOpen.set(false);
      }
    });

    effect(() => {
      const section = this.browserTabSectionTitle();
      const product = this.i18n.t('app.title');
      this.title.setTitle(section === product ? product : `${section} · ${product}`);
    });
  }

  private primeShellDataWhenAllowed(): void {
    if (this.shellPrimed) {
      return;
    }
    if (isResolvedApiBaseRemoteHost() && !this.keycloakAuth.usesKeycloakAuth()) {
      return;
    }
    if (this.keycloakAuth.usesKeycloakAuth() && !this.keycloakAuth.isAuthenticated()) {
      return;
    }
    this.shellPrimed = true;
    this.loadShellUserAndBaselines();
  }

  private loadShellUserAndBaselines(): void {
    this.shellBootstrapLoading.set(true);
    this.reloadBaselines(undefined, { shellInitialLoad: true });
    this.api
      .getMe()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (me) => {
          this.currentUserDisplayName.set(me.displayName?.trim() || '');
          this.theme.applyFromServer(me.colorScheme);
          if (me.uiDensity !== undefined) {
            this.theme.applyUiDensityFromServer(me.uiDensity);
          }
        },
        error: () => this.currentUserDisplayName.set('')
      });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeAllHeaderMenus();
  }

  /** Escape dismisses the topmost app shell modal (works from any focused control). */
  @HostListener('document:keydown.escape', ['$event'])
  onDocumentEscapeCloseAppModal(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !isKeyboardCancel(event)) {
      return;
    }
    if (this.mobileAppMenuOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.closeMobileShellMenu();
      return;
    }
    if (this.sessionExpiredUi.modalOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.closeSessionExpiredModal();
      return;
    }
    if (this.appInfoModalOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.closeAppInfoModal();
      return;
    }
    if (this.sharingModalOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.closeSharingModal();
      return;
    }
    if (this.sentInvitationsModalOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.closeSentInvitationsModal();
      return;
    }
    if (this.renameBaselineModalOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.tryCloseRenameBaselineModal();
      return;
    }
    if (this.newBaselineModalOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.tryCloseNewBaselineModal();
    }
  }

  private closeAllHeaderMenus(): void {
    this.userMenuOpen.set(false);
    this.workspaceMenuOpen.set(false);
    this.accessMenuOpen.set(false);
  }

  closeMobileShellMenu(): void {
    this.mobileAppMenuOpen.set(false);
  }

  toggleMobileShellMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.closeAllHeaderMenus();
    this.mobileAppMenuOpen.update((open) => !open);
  }

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    const next = !this.userMenuOpen();
    this.workspaceMenuOpen.set(false);
    this.accessMenuOpen.set(false);
    this.userMenuOpen.set(next);
  }

  toggleWorkspaceMenu(event: MouseEvent): void {
    event.stopPropagation();
    const next = !this.workspaceMenuOpen();
    this.userMenuOpen.set(false);
    this.accessMenuOpen.set(false);
    this.workspaceMenuOpen.set(next);
  }

  toggleAccessMenu(event: MouseEvent): void {
    event.stopPropagation();
    const next = !this.accessMenuOpen();
    this.userMenuOpen.set(false);
    this.workspaceMenuOpen.set(false);
    this.accessMenuOpen.set(next);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  closeWorkspaceMenu(): void {
    this.workspaceMenuOpen.set(false);
  }

  closeAccessMenu(): void {
    this.accessMenuOpen.set(false);
  }

  openNewBaselineFromWorkspaceMenu(): void {
    this.closeWorkspaceMenu();
    this.closeMobileShellMenu();
    this.openNewBaselineModal();
  }

  forkFromWorkspaceMenu(): void {
    this.forkSelectedBaseline();
    this.closeWorkspaceMenu();
    this.closeMobileShellMenu();
  }

  acceptInvitationFromAccessMenu(): void {
    this.acceptInvitationToken();
  }

  openSharingModalFromAccessMenu(): void {
    this.closeAccessMenu();
    this.closeMobileShellMenu();
    this.openSharingModal();
  }

  openSentInvitationsFromAccessMenu(): void {
    this.closeAccessMenu();
    this.closeMobileShellMenu();
    this.sentInvitationsError = '';
    this.sentInvitationsModalOpen.set(true);
    this.loadSentInvitations();
  }

  openHelpFromMenu(): void {
    this.closeUserMenu();
    this.closeMobileShellMenu();
    void this.router.navigate(['/help']);
  }

  openAppInfoModal(): void {
    this.copyVersionInfoError = '';
    this.closeUserMenu();
    this.closeMobileShellMenu();
    this.appInfoModalOpen.set(true);
  }

  closeAppInfoModal(): void {
    this.appInfoModalOpen.set(false);
    this.copyVersionInfoError = '';
  }

  copyVersionInfoToClipboard(): void {
    this.copyVersionInfoError = '';
    const text = this.versionInfoClipboardText();
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      this.copyVersionInfoError = this.i18n.t('app.versionInfoCopyFailed');
      return;
    }
    void navigator.clipboard.writeText(text).catch(() => {
      this.copyVersionInfoError = this.i18n.t('app.versionInfoCopyFailed');
    });
  }

  logoutFromMenu(): void {
    this.closeUserMenu();
    this.closeMobileShellMenu();
    void this.keycloakAuth.logout();
  }

  private refreshSessionValidityLabel(): void {
    if (!this.keycloakAuth.usesKeycloakAuth() || !this.keycloakAuth.isAuthenticated()) {
      this.sessionValidityText.set('');
      return;
    }
    const expSec = this.keycloakAuth.getAccessTokenExpiryEpochSec();
    if (expSec === undefined) {
      this.sessionValidityText.set('');
      return;
    }
    const remainingSec = Math.max(0, Math.floor(expSec - Date.now() / 1000));
    this.sessionValidityText.set(this.formatAccessTokenCountdown(remainingSec));
  }

  private formatAccessTokenCountdown(totalSec: number): string {
    if (totalSec >= 3600) {
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      return `${h}:${m.toString().padStart(2, '0')}:${Math.floor(totalSec % 60)
        .toString()
        .padStart(2, '0')}`;
    }
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  closeSentInvitationsModal(): void {
    this.sentInvitationsModalOpen.set(false);
    this.sentInvitationsError = '';
  }

  openRenameBaselineFromWorkspaceMenu(): void {
    this.closeWorkspaceMenu();
    this.closeMobileShellMenu();
    const selected = this.state.selectedBaseline();
    if (!selected || selected.myAccess !== 'Owner' || selected.isSampleDemo) {
      return;
    }
    this.renameBaselineError = '';
    this.renameBaselineName = selected.name;
    this.renameBaselineOriginalName = selected.name;
    this.renameBaselineModalOpen = true;
  }

  closeRenameBaselineModal(): void {
    this.renameBaselineModalOpen = false;
    this.renameBaselineName = '';
    this.renameBaselineOriginalName = '';
    this.renameBaselineError = '';
  }

  tryCloseRenameBaselineModal(): boolean {
    if (!this.renameBaselineModalOpen) {
      return true;
    }
    if (!this.isRenameBaselineModalDirty()) {
      this.closeRenameBaselineModal();
      return true;
    }
    if (confirmDiscardUnsavedChanges(this.i18n.t('budget.discardUnsavedEditConfirm'))) {
      this.closeRenameBaselineModal();
      return true;
    }
    return false;
  }

  private isRenameBaselineModalDirty(): boolean {
    return this.renameBaselineName.trim() !== this.renameBaselineOriginalName.trim();
  }

  saveRenamedBaseline(): void {
    const selected = this.state.selectedBaseline();
    const name = this.renameBaselineName.trim();
    if (!selected || selected.myAccess !== 'Owner' || !name || selected.isSampleDemo) {
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
    this.closeWorkspaceMenu();
    this.closeMobileShellMenu();
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

  tryCloseNewBaselineModal(): boolean {
    if (!this.newBaselineModalOpen) {
      return true;
    }
    if (!this.isNewBaselineModalDirty()) {
      this.closeNewBaselineModal();
      return true;
    }
    if (confirmDiscardUnsavedChanges(this.i18n.t('budget.discardUnsavedEditConfirm'))) {
      this.closeNewBaselineModal();
      return true;
    }
    return false;
  }

  private isNewBaselineModalDirty(): boolean {
    return this.newBaselineModalName.trim() !== '';
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

  onNewBaselineModalEnterConfirm(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardConfirmForModal(event) || !this.newBaselineModalOpen) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.confirmNewBaseline();
  }

  onNewBaselineModalEscapeCancel(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardCancelFromTarget(event) || !this.newBaselineModalOpen) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.tryCloseNewBaselineModal();
  }

  onRenameBaselineModalEnterConfirm(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardConfirmForModal(event) || !this.renameBaselineModalOpen) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.saveRenamedBaseline();
  }

  onRenameBaselineModalEscapeCancel(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardCancelFromTarget(event) || !this.renameBaselineModalOpen) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.tryCloseRenameBaselineModal();
  }

  onSentInvitationsModalEscapeCancel(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardCancelFromTarget(event) || !this.sentInvitationsModalOpen()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.closeSentInvitationsModal();
  }

  onSharingModalEscapeCancel(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardCancelFromTarget(event) || !this.sharingModalOpen()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.closeSharingModal();
  }

  onSharingModalEnterConfirm(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardConfirmForModal(event) || !this.sharingModalOpen()) {
      return;
    }
    if (!this.state.selectedBaselineId() || !this.isOwnerOfSelectedBaseline()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.createShareInvitation();
  }

  onSessionExpiredModalEnterConfirm(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardConfirmForModal(event) || !this.sessionExpiredUi.modalOpen()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.onSessionExpiredSignInAgain();
  }

  onSessionExpiredModalEscapeCancel(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardCancelFromTarget(event) || !this.sessionExpiredUi.modalOpen()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.closeSessionExpiredModal();
  }

  onAppInfoModalEscapeCancel(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardCancelFromTarget(event) || !this.appInfoModalOpen()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.closeAppInfoModal();
  }

  onAppInfoModalEnterConfirm(event: Event): void {
    if (!(event instanceof KeyboardEvent) || !shouldKeyboardConfirmForModal(event) || !this.appInfoModalOpen()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.copyVersionInfoToClipboard();
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
          this.closeAccessMenu();
          this.closeMobileShellMenu();
          this.reloadBaselines(response.baselineId);
        }
      });
  }

  t(key: string): string {
    return this.i18n.t(key);
  }

  private syncShellRouteFromRouter(): void {
    const raw = this.router.url.split('?')[0].split('#')[0];
    const parts = raw.replace(/^\/+/, '').split('/').filter(Boolean);
    const first = (parts[0] || 'dashboard').toLowerCase();
    if (first === 'dashboard' || first === 'budget' || first === 'actuals' || first === 'accounts' || first === 'help') {
      this.shellRouteSegment.set(first);
    } else {
      this.shellRouteSegment.set('app');
    }
  }

  onSessionExpiredSignInAgain(): void {
    this.sessionExpiredUi.close();
    void this.keycloakAuth.login();
  }

  closeSessionExpiredModal(): void {
    this.sessionExpiredUi.close();
  }

  onToolbarBaselineSelect(baselineId: string): void {
    if (!baselineId || baselineId === this.state.selectedBaselineId()) {
      return;
    }
    this.state.selectBaseline(baselineId);
    this.remountRouteOutlet();
    this.closeMobileShellMenu();
  }

  private remountRouteOutlet(): void {
    this.routeOutletMounted.set(false);
    queueMicrotask(() => this.routeOutletMounted.set(true));
  }

  private reloadBaselines(
    selectBaselineId?: string,
    options?: { shellInitialLoad?: boolean }
  ): void {
    const shellInitialLoad = options?.shellInitialLoad === true;
    this.api
      .getBaselines()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (baselines) => {
          this.state.setBaselines(baselines);
          if (selectBaselineId && baselines.some((b) => b.id === selectBaselineId)) {
            this.state.selectBaseline(selectBaselineId);
          }
          if (shellInitialLoad) {
            this.shellBootstrapLoading.set(false);
          }
        },
        error: () => {
          this.state.setBaselines([]);
          if (shellInitialLoad) {
            this.shellBootstrapLoading.set(false);
          }
        }
      });
  }
}
