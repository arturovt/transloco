/**
 * Global Angular-specific TypeScript declarations.
 *
 * `ngDevMode` and `ngServerMode` are compile-time globals defined by the Angular
 * CLI/bundler. These ambient declarations make them available for type checking
 * in both library and test code (the library reads them at runtime behind a
 * `typeof` guard, e.g. the SSR checks in `transloco-persist-lang`).
 */

/**
 * ngDevMode is used by Angular for tokens in dependency injection.
 * This declaration makes it available globally for type checking.
 */
declare const ngDevMode: boolean;

/**
 * ngServerMode is used by Angular to determine if the application is running in server-side rendering mode.
 * This declaration makes it available globally for type checking.
 */
declare const ngServerMode: boolean;
