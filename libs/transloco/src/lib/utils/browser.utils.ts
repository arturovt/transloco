export function isBrowser() {
  // Prefer `ngServerMode` (Angular v17+) for SSR detection, falling back to checking `window` for
  // older Angular versions and MFE scenarios where `ngServerMode` may not be available.
  // This lets bundlers tree-shake the `window` check when `ngServerMode` is always defined.
  if (typeof ngServerMode !== 'undefined' && ngServerMode) {
    return false;
  } else {
    return typeof window !== 'undefined';
  }
}

/**
 * Returns the language code name from the browser, e.g. "en"
 */
export function getBrowserLang(): string | undefined {
  let browserLang = getBrowserCultureLang();
  // The leading `ngServerMode` operand is deliberate, not a double-check:
  // `isBrowser()` already returns `false` when `ngServerMode` is `true`, but
  // spelling it out here lets the minifier fold this branch to `true` in the
  // server build and drop the rest of the function. See `getBrowserCultureLang`.
  if (
    !browserLang ||
    (typeof ngServerMode !== 'undefined' && ngServerMode) ||
    !isBrowser()
  ) {
    return undefined;
  }

  if (browserLang.indexOf('-') !== -1) {
    browserLang = browserLang.split('-')[0];
  }

  if (browserLang.indexOf('_') !== -1) {
    browserLang = browserLang.split('_')[0];
  }

  return browserLang;
}

/**
 * Returns the culture language code name from the browser, e.g. "en-US"
 */
export function getBrowserCultureLang(): string {
  // The leading `ngServerMode` operand is intentionally redundant, not an
  // accidental double-check: `isBrowser()` already returns `false` when
  // `ngServerMode` is `true`. It's kept as an explicit, statically-analyzable
  // first operand so the minifier can fold this whole `if` to `true` in the
  // server build and strip the DOM-dependent body below. A bare `!isBrowser()`
  // can't be folded here because `isBrowser` is referenced from more than one
  // place, so it isn't inlined.
  if ((typeof ngServerMode !== 'undefined' && ngServerMode) || !isBrowser()) {
    return '';
  }

  const navigator = window.navigator;

  return navigator.languages?.[0] ?? navigator.language;
}
