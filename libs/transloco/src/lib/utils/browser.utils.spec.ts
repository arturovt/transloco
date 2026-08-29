import {
  getBrowserCultureLang,
  getBrowserLang,
  isBrowser,
} from './browser.utils';

/**
 * `ngServerMode` is a build-time global defined by the Angular CLI; it's
 * `undefined` at runtime in these specs unless a test sets it. Toggle it the
 * same way the missing-handler specs toggle `ngDevMode`.
 */
function setServerMode(value: boolean | undefined) {
  const glob = globalThis as { ngServerMode?: boolean };
  if (value === undefined) {
    delete glob.ngServerMode;
  } else {
    glob.ngServerMode = value;
  }
}

describe('browser.utils', () => {
  afterEach(() => setServerMode(undefined));

  describe('isBrowser', () => {
    it(`GIVEN a DOM environment and ngServerMode is unset
        WHEN isBrowser is called
        THEN returns true`, () => {
      expect(isBrowser()).toBe(true);
    });

    it(`GIVEN ngServerMode is true
        WHEN isBrowser is called
        THEN returns false even though window exists`, () => {
      setServerMode(true);
      expect(typeof window).not.toBe('undefined');
      expect(isBrowser()).toBe(false);
    });

    it(`GIVEN ngServerMode is false
        WHEN isBrowser is called
        THEN falls back to the window check and returns true`, () => {
      setServerMode(false);
      expect(isBrowser()).toBe(true);
    });
  });

  describe('getBrowserCultureLang', () => {
    it(`GIVEN ngServerMode is true
        WHEN getBrowserCultureLang is called
        THEN returns an empty string without touching the DOM`, () => {
      setServerMode(true);
      expect(getBrowserCultureLang()).toBe('');
    });

    it(`GIVEN a browser environment
        WHEN getBrowserCultureLang is called
        THEN returns the navigator language`, () => {
      const expected =
        window.navigator.languages?.[0] ?? window.navigator.language;
      expect(getBrowserCultureLang()).toBe(expected);
    });
  });

  describe('getBrowserLang', () => {
    it(`GIVEN ngServerMode is true
        WHEN getBrowserLang is called
        THEN returns undefined`, () => {
      setServerMode(true);
      expect(getBrowserLang()).toBeUndefined();
    });

    it(`GIVEN a browser environment
        WHEN getBrowserLang is called
        THEN returns the language part without the region`, () => {
      const expected = getBrowserCultureLang().split(/[-_]/)[0];
      expect(getBrowserLang()).toBe(expected);
    });
  });
});
