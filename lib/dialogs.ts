// Cross-platform dialogs.
//
// react-native-web ships `Alert.alert` as an empty function, so on the web/PWA
// every confirm, error message and multi-choice prompt in the app silently did
// nothing. `installWebAlert()` (called from index.ts) replaces it with a small
// DOM dialog that supports any number of buttons, so every existing
// `Alert.alert(...)` call works on web exactly like it does on native.

import { Alert, AlertButton, Platform } from 'react-native';

const COLORS = {
  primary: '#9C321B',
  text: '#1a1a1a',
  textSecondary: '#666',
  destructive: '#d32f2f',
  border: '#e5e5e5',
};

function showWebDialog(title: string, message: string | undefined, buttons: AlertButton[] | undefined, cancelable: boolean) {
  const doc: Document | undefined = (globalThis as any).document;
  if (!doc) return;

  const list: AlertButton[] = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  const cancelButton = list.find(b => b.style === 'cancel');

  const overlay = doc.createElement('div');
  overlay.setAttribute('role', 'presentation');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.45)', zIndex: '2147483000',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
  } as CSSStyleDeclaration);

  const box = doc.createElement('div');
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-modal', 'true');
  Object.assign(box.style, {
    background: '#fff', borderRadius: '14px', maxWidth: '340px', width: '100%',
    boxShadow: '0 10px 40px rgba(0,0,0,0.25)', overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  } as CSSStyleDeclaration);

  const body = doc.createElement('div');
  Object.assign(body.style, { padding: '20px 20px 16px', textAlign: 'center' } as CSSStyleDeclaration);
  const h = doc.createElement('div');
  h.textContent = title;
  Object.assign(h.style, { fontWeight: '600', fontSize: '17px', color: COLORS.text } as CSSStyleDeclaration);
  body.appendChild(h);
  if (message) {
    const p = doc.createElement('div');
    p.textContent = message;
    Object.assign(p.style, { marginTop: '8px', fontSize: '14px', color: COLORS.textSecondary, whiteSpace: 'pre-wrap', lineHeight: '1.4' } as CSSStyleDeclaration);
    body.appendChild(p);
  }
  box.appendChild(body);

  // Two buttons sit side by side (cancel on the left); more stack vertically.
  const row = list.length === 2;
  const ordered = row && cancelButton ? [cancelButton, ...list.filter(b => b !== cancelButton)] : list;
  const actions = doc.createElement('div');
  Object.assign(actions.style, { display: 'flex', flexDirection: row ? 'row' : 'column', borderTop: `1px solid ${COLORS.border}` } as CSSStyleDeclaration);

  let closed = false;
  const close = (button?: AlertButton) => {
    if (closed) return;
    closed = true;
    overlay.remove();
    doc.removeEventListener('keydown', onKey);
    // Defer so a follow-up Alert opened from onPress renders cleanly.
    setTimeout(() => button?.onPress?.(), 0);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (cancelable || cancelButton)) close(cancelButton);
  };

  ordered.forEach((button, i) => {
    const el = doc.createElement('button');
    el.type = 'button';
    el.textContent = button.text ?? 'OK';
    const color = button.style === 'destructive' ? COLORS.destructive : COLORS.primary;
    Object.assign(el.style, {
      flex: '1', padding: '13px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
      fontSize: '16px', color, fontWeight: button.style === 'cancel' ? '400' : '600',
      borderLeft: row && i > 0 ? `1px solid ${COLORS.border}` : 'none',
      borderTop: !row && i > 0 ? `1px solid ${COLORS.border}` : 'none',
    } as CSSStyleDeclaration);
    el.addEventListener('click', () => close(button));
    actions.appendChild(el);
  });
  box.appendChild(actions);
  overlay.appendChild(box);

  overlay.addEventListener('click', e => {
    if (e.target === overlay && (cancelable || cancelButton)) close(cancelButton);
  });
  doc.addEventListener('keydown', onKey);
  doc.body.appendChild(overlay);
  (actions.querySelector('button:last-child') as HTMLButtonElement | null)?.focus();
}

export function installWebAlert() {
  if (Platform.OS !== 'web') return;
  (Alert as any).alert = (title: string, message?: string, buttons?: AlertButton[], options?: { cancelable?: boolean }) =>
    showWebDialog(title, message, buttons, options?.cancelable ?? true);
}

/** Promise-based confirm. Resolves true when the user picks the confirm button. */
export function confirmAsync(title: string, message: string, confirmText = 'OK', destructive = false): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
