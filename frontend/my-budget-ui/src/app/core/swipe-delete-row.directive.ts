import { Directive, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';

/**
 * Emits `swipeDelete` after a dominant left swipe on the host row (e.g. mobile without an actions column).
 * Suppresses the following click so row-level “open / edit” handlers do not run.
 */
@Directive({
  selector: '[appSwipeDeleteRow]',
  standalone: true
})
export class SwipeDeleteRowDirective {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input({ alias: 'appSwipeDeleteRow' }) enabled = false;

  @Output() readonly swipeDelete = new EventEmitter<void>();

  private startX = 0;
  private startY = 0;
  private tracking = false;
  private sawLeftDominant = false;
  private suppressClick = false;

  private static readonly minDx = 72;
  private static readonly dominance = 1.2;

  private isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false;
    }
    const root = this.host.nativeElement;
    if (!root.contains(target)) {
      return false;
    }
    return !!target.closest('button, a, input, select, textarea, label, [role="button"]');
  }

  @HostListener('pointerdown', ['$event'])
  onPointerDown(ev: PointerEvent): void {
    if (!this.enabled || ev.button !== 0) {
      return;
    }
    if (this.isInteractiveTarget(ev.target)) {
      return;
    }
    this.tracking = true;
    this.sawLeftDominant = false;
    this.startX = ev.clientX;
    this.startY = ev.clientY;
    try {
      this.host.nativeElement.setPointerCapture(ev.pointerId);
    } catch {
      /* noop */
    }
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(ev: PointerEvent): void {
    if (!this.tracking) {
      return;
    }
    const dx = ev.clientX - this.startX;
    const dy = ev.clientY - this.startY;
    if (dx <= -SwipeDeleteRowDirective.minDx * 0.35 && Math.abs(dx) >= Math.abs(dy) * SwipeDeleteRowDirective.dominance) {
      this.sawLeftDominant = true;
    }
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(ev: PointerEvent): void {
    if (!this.tracking) {
      return;
    }
    this.tracking = false;
    this.releaseCapture(ev.pointerId);
    const dx = ev.clientX - this.startX;
    const dy = ev.clientY - this.startY;
    const fire =
      this.sawLeftDominant &&
      dx <= -SwipeDeleteRowDirective.minDx &&
      Math.abs(dx) >= Math.abs(dy) * SwipeDeleteRowDirective.dominance;
    this.sawLeftDominant = false;
    if (fire) {
      this.suppressClick = true;
      this.swipeDelete.emit();
    }
  }

  @HostListener('pointercancel', ['$event'])
  onPointerCancel(ev: PointerEvent): void {
    if (!this.tracking) {
      return;
    }
    this.tracking = false;
    this.sawLeftDominant = false;
    this.releaseCapture(ev.pointerId);
  }

  private releaseCapture(pointerId: number): void {
    const el = this.host.nativeElement;
    try {
      if (el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      /* noop */
    }
  }

  @HostListener('click', ['$event'])
  onClick(ev: MouseEvent): void {
    if (!this.suppressClick) {
      return;
    }
    this.suppressClick = false;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
  }
}
