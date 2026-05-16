import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { KeyboardAddShortcutService } from './keyboard-add-shortcut.service';

@Component({
  template: `@if (open()) { <span id="sheet">open</span> }`,
  standalone: true
})
class HostComponent {
  readonly open = signal(false);
}

describe('KeyboardAddShortcutService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('runs the registered add action on Insert', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const host = fixture.componentInstance;
    const service = TestBed.inject(KeyboardAddShortcutService);

    service.register(
      () => host.open.set(true),
      () => true
    );

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Insert', code: 'Insert', bubbles: true, cancelable: true })
    );
    fixture.detectChanges();

    expect(host.open()).toBe(true);
    expect(fixture.nativeElement.querySelector('#sheet')).not.toBeNull();
  });

  it('runs the registered add action on +', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const host = fixture.componentInstance;
    const service = TestBed.inject(KeyboardAddShortcutService);

    service.register(
      () => host.open.set(true),
      () => true
    );

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true })
    );
    fixture.detectChanges();

    expect(host.open()).toBe(true);
    expect(fixture.nativeElement.querySelector('#sheet')).not.toBeNull();
  });

  it('does not run when canActivate is false', () => {
    const service = TestBed.inject(KeyboardAddShortcutService);
    let called = false;

    service.register(
      () => {
        called = true;
      },
      () => false
    );

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true })
    );

    expect(called).toBe(false);
  });
});
