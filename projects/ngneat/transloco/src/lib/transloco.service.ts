import { Inject, Injectable } from '@angular/core';
import { BehaviorSubject, from, Observable, Subject } from 'rxjs';
import { catchError, map, retry, shareReplay, tap } from 'rxjs/operators';
import { TRANSLOCO_LOADER, TranslocoLoader } from './transloco.loader';
import { TRANSLOCO_TRANSPILER, TranslocoTranspiler } from './transloco.transpiler';
import { HashMap, Translation, TranslationCb, TranslocoEvents } from './types';
import { getValue, isFunction, mergeDeep, setValue } from './helpers';
import { defaultConfig, TRANSLOCO_CONFIG, TranslocoConfig } from './transloco.config';
import { TRANSLOCO_MISSING_HANDLER, TranslocoMissingHandler } from './transloco-missing-handler';
import { TRANSLOCO_INTERCEPTOR, TranslocoInterceptor } from './transloco.interceptor';
import { TRANSLOCO_FALLBACK_STRATEGY, TranslocoFallbackStrategy } from './transloco-fallback-strategy';

let service: TranslocoService;

export function translate<T = Translation>(key: TranslationCb<T>, params?: HashMap, lang?: string): string;
export function translate(key: string, params?: HashMap, lang?: string): string;
export function translate(key: string[], params?: HashMap, lang?: string): string[];
export function translate<T = Translation>(
  key: string | string[] | TranslationCb<T>,
  params: HashMap = {},
  lang?: string
): string | string[] {
  return service.translate(key, params, lang);
}

@Injectable({ providedIn: 'root' })
export class TranslocoService {
  private translations = new Map<string, Translation>();
  private cache = new Map<string, Observable<Translation>>();
  private defaultLang: string;
  private mergedConfig: TranslocoConfig;

  private lang: BehaviorSubject<string>;
  langChanges$: Observable<string>;

  private events = new Subject<TranslocoEvents>();
  events$ = this.events.asObservable();

  private failedCounter = 0;
  private failedLangs = new Set<string>();

  constructor(
    @Inject(TRANSLOCO_LOADER) private loader: TranslocoLoader,
    @Inject(TRANSLOCO_TRANSPILER) private parser: TranslocoTranspiler,
    @Inject(TRANSLOCO_MISSING_HANDLER) private missingHandler: TranslocoMissingHandler,
    @Inject(TRANSLOCO_INTERCEPTOR) private interceptor: TranslocoInterceptor,
    @Inject(TRANSLOCO_CONFIG) private userConfig: TranslocoConfig,
    @Inject(TRANSLOCO_FALLBACK_STRATEGY) private fallbackStrategy: TranslocoFallbackStrategy
  ) {
    service = this;
    this.mergedConfig = { ...defaultConfig, ...this.userConfig };
    this.setDefaultLang(this.mergedConfig.defaultLang);
    this.lang = new BehaviorSubject<string>(this.getDefaultLang());
    this.langChanges$ = this.lang.asObservable();

    /**
     * When we have a failure, we want to define the next language that succeeded as the active
     */
    this.events$.subscribe(e => {
      if (e.type === 'translationLoadSuccess' && e.wasFailure) {
        this.setActiveLang(e.payload.lang);
      }
    });
  }

  get config(): TranslocoConfig {
    return this.mergedConfig;
  }

  getDefaultLang() {
    return this.defaultLang;
  }

  setDefaultLang(lang: string) {
    this.defaultLang = lang;
  }

  getActiveLang() {
    return this.lang.getValue();
  }

  setActiveLang(lang: string) {
    this.lang.next(lang);
    return this;
  }

  load(lang: string, options?: { fallbackLangs: string[] | null }): Observable<Translation> {
    if (this.cache.has(lang) === false) {
      const mergedOptions = { ...{ fallbackLangs: null }, ...(options || {}) };

      const load$ = from(this.loader.getTranslation(lang)).pipe(
        retry(this.mergedConfig.failedRetries),
        catchError(() => this.handleFailedLang(lang, mergedOptions)),
        tap(translation => this.handleSuccess(lang, translation)),
        shareReplay(1)
      );

      this.cache.set(lang, load$);
    }

    return this.cache.get(lang);
  }

  /**
   * Gets the instant translated value of a key
   *
   * @example
   *
   * translate('hello')
   * translate('hello', { value: 'value' })
   * translate(['hello', 'key'])
   * translate('hello', { }, 'en')
   */
  translate<T = Translation>(key: TranslationCb<T>, params?: HashMap, lang?: string): string;
  translate(key: string, params?: HashMap, lang?: string): string;
  translate(key: string[], params?: HashMap, lang?: string): string[];
  translate<T = Translation>(
    key: string | string[] | TranslationCb<T>,
    params?: HashMap,
    lang?: string
  ): string | string[];
  translate<T = Translation>(
    key: string | string[] | TranslationCb<T>,
    params: HashMap = {},
    lang?: string
  ): string | string[] {
    if (Array.isArray(key)) {
      return key.map(k => this.translate(k, params, lang));
    }

    if (!key) {
      return this.missingHandler.handle(key as string, params, this.config);
    }

    const translation = this.translations.get(lang || this.getActiveLang());
    if (!translation) {
      return '';
    }

    const value = isFunction(key) ? key(translation as T, params) : getValue(translation, key);

    if (!value) {
      return this.missingHandler.handle(key, params, this.config);
    }

    return this.parser.transpile(value, params, translation);
  }

  /**
   * Gets the translated value of a key as observable
   *
   * @example
   * selectTranslate('hello').subscribe(value => {})
   * selectTranslate('hello').subscribe(value => {}, 'es')
   */
  selectTranslate(key: string, params?: HashMap, lang?: string) {
    return this.load(lang || this.getActiveLang()).pipe(map(() => this.translate(key, params, lang)));
  }

  /**
   *  Translate a given value
   *
   *  @example
   *  transpile('Hello {{ value }}', { value: 'World' })
   *  transpile('Hello {{ value }}', { value: 'World' }, 'es')
   */
  transpile(value: string, params: HashMap = {}, lang = this.getActiveLang()): string {
    const translation = this.translations.get(lang);
    return this.parser.transpile(value, params, translation);
  }

  /**
   * Gets an object of translations for a given language
   *
   * @example
   * getTranslation('en')
   * getTranslation('admin-page/en')
   */
  getTranslation(): Map<string, Translation>;
  getTranslation(lang: string): Translation;
  getTranslation(lang?: string): Map<string, Translation> | Translation | undefined {
    return lang ? this.translations.get(lang) : this.translations;
  }

  /**
   * Sets or merge a given translation object to current lang
   *
   * @example
   *
   * setTranslation({ ... })
   * setTranslation({ ... }, 'en')
   * setTranslation({ ... }, 'admin-page/en', { merge: false } )
   */
  setTranslation(data: Translation, lang = this.getActiveLang(), options: { merge?: boolean } = {}) {
    const defaults = { merge: true };
    const mergedOptions = { ...defaults, ...options };
    const translation = this.getTranslation(lang) || {};
    const merged = mergedOptions.merge ? mergeDeep(translation, data) : data;
    this._setTranslation(lang, merged);
    this.setActiveLang(this.getActiveLang());
  }

  /**
   * Sets translation key with given value
   *
   * @example
   *
   * setTranslationKey('key', 'value')
   * setTranslationKey('key.nested', 'value')
   * setTranslationKey('key.nested', 'value', 'en')
   */
  setTranslationKey(key: string, value: string, lang = this.getDefaultLang()) {
    const translation = this.getTranslation(lang);
    if (translation) {
      const withHook = this.interceptor.preSaveTranslationKey(key, value, lang);
      const newValue = setValue(translation, key, withHook);
      this.translations.set(lang, newValue);
      this.setActiveLang(this.getActiveLang());
    }
  }

  private _setTranslation(lang: string, translation: Translation) {
    const withHook = this.interceptor.preSaveTranslation(translation, lang);
    this.translations.set(lang, withHook);
  }

  private handleSuccess(lang: string, translation: Translation) {
    if (this.failedLangs.has(lang) === false) {
      this._setTranslation(lang, translation);
      if (!this.config.prodMode) {
        console.log(`%c 🍻 Translation Load Success: ${lang}`, 'background: #fff; color: hotpink;');
      }

      this.events.next({
        wasFailure: !!this.failedLangs.size,
        type: 'translationLoadSuccess',
        payload: {
          lang
        }
      });

      this.failedLangs.forEach(l => this.cache.delete(l));
      this.failedCounter = 0;
    } else {
      this.failedLangs.delete(lang);
    }
  }

  private handleFailedLang(lang: string, mergedOptions) {
    this.failedLangs.add(lang);
    const fallbacks = mergedOptions.fallbackLangs || this.fallbackStrategy.getNextLangs(lang);
    const nextLang = fallbacks[this.failedCounter];
    if (!nextLang) {
      throw new Error(`Unable to load translation and all the fallback languages`);
    }
    this.failedCounter++;
    this.events.next({
      type: 'translationLoadFailure',
      payload: {
        lang
      }
    });

    return this.load(nextLang);
  }
}