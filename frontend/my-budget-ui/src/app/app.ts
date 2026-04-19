import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { BaselineInvitation, BaselineMember } from './core/budget.models';
import { BudgetApiService } from './core/budget-api.service';
import { BudgetStateService } from './core/budget-state.service';
import { I18nService } from './core/i18n.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly api = inject(BudgetApiService);
  readonly state = inject(BudgetStateService);
  readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);

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

  constructor() {
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
      .forkBaseline(selected.id, { name: `${selected.name} (${this.i18n.t('app.forkSelected')})` })
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

  private reloadBaselines(selectBaselineId?: string): void {
    this.api
      .getBaselines()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (baselines) => {
          this.state.setBaselines(baselines);
          if (selectBaselineId && baselines.some((b) => b.id === selectBaselineId)) {
            this.state.selectedBaselineId.set(selectBaselineId);
          }
        },
        error: () => this.state.setBaselines([])
      });
  }
}
