import {
  createServiceFactory,
  mockProvider,
  SpectatorService,
} from '@ngneat/spectator/vitest';
import type { MockInstance } from 'vitest';
import { PLATFORM_ID } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';

import { TranslocoPersistLangService } from './persist-lang.service';
import { PersistStorage } from './persist-lang.types';
import { provideTranslocoPersistLang } from './persist-lang.providers';

interface FakeStorage extends PersistStorage {
  storage: Map<string, any>;
}

const fakeStorage: FakeStorage = {
  storage: new Map(),
  getItem(key) {
    return this.storage.get(key) || null;
  },
  setItem(key, value) {
    this.storage.set(key, value);
  },
  removeItem(key) {
    this.storage.delete(key);
  },
};

const translocoServiceMock = {
  langChanges$: new BehaviorSubject('en'),
  setActiveLang(lang: string) {
    this.langChanges$.next(lang);
  },
  config: {
    defaultLang: 'en',
  },
  getActiveLang() {
    return this.langChanges$.getValue();
  },
};

describe('PersistLang', () => {
  let spectator: SpectatorService<TranslocoPersistLangService>;
  const serviceFactory = createServiceFactory({
    service: TranslocoPersistLangService,
    providers: [
      mockProvider(TranslocoService, translocoServiceMock),
      provideTranslocoPersistLang({
        storage: {
          useValue: fakeStorage,
        },
      }),
    ],
  });

  let saveSpy: MockInstance<
    (typeof TranslocoPersistLangService.prototype)['save']
  >;

  beforeEach(() => {
    spectator = serviceFactory();
    saveSpy = vi.spyOn(TranslocoPersistLangService.prototype as any, 'save');
  });

  describe('Save lang to storage', () => {
    it(`GIVEN service initialized
        WHEN no language change has occurred
        THEN does not save initial language to storage`, () => {
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it(`GIVEN service initialized
        WHEN active language is changed to 'es'
        THEN saves new language to storage with correct key`, () => {
      const setItemSpy = vi.spyOn(fakeStorage, 'setItem');
      spectator.inject(TranslocoService).setActiveLang('es');
      expect(saveSpy).toHaveBeenCalledWith('es');
      expect(setItemSpy).toHaveBeenCalledWith('translocoLang', 'es');
    });
  });

  describe('Get lang from storage', () => {
    let setActiveLangSpy: MockInstance<
      (typeof TranslocoPersistLangService.prototype)['setActiveLang']
    >;
    let getItemSpy: MockInstance<PersistStorage['getItem']>;

    beforeAll(() => {
      setActiveLangSpy = vi.spyOn(
        TranslocoPersistLangService.prototype as any,
        'setActiveLang',
      );
      getItemSpy = vi.spyOn(fakeStorage, 'getItem');
    });

    it(`GIVEN language previously saved in storage
        WHEN service initializes
        THEN retrieves language from storage and sets it as active`, () => {
      expect(setActiveLangSpy).toHaveBeenCalled();
      expect(getItemSpy).toHaveBeenCalledWith('translocoLang');
      expect(spectator.inject(TranslocoService).getActiveLang()).toEqual('es');
    });

    it(`GIVEN language stored in cache
        WHEN getCachedLang is called
        THEN returns the cached language value`, () => {
      expect(spectator.service.getCachedLang()).toEqual('es');
    });
  });

  it(`GIVEN language stored in cache
      WHEN clear is called
      THEN removes language from storage and cache returns null`, () => {
    spectator.service.clear();
    expect(spectator.service.getCachedLang()).toEqual(null);
  });
});

describe('PersistLang - SSR / server mode', () => {
  const ssrStorage: FakeStorage = {
    storage: new Map(),
    getItem(key) {
      return this.storage.get(key) || null;
    },
    setItem(key, value) {
      this.storage.set(key, value);
    },
    removeItem(key) {
      this.storage.delete(key);
    },
  };

  const ssrTranslocoServiceMock = {
    langChanges$: new BehaviorSubject('en'),
    setActiveLang(lang: string) {
      this.langChanges$.next(lang);
    },
    config: {
      defaultLang: 'en',
    },
    getActiveLang() {
      return this.langChanges$.getValue();
    },
  };

  const serviceFactory = createServiceFactory({
    service: TranslocoPersistLangService,
    providers: [
      mockProvider(TranslocoService, ssrTranslocoServiceMock),
      provideTranslocoPersistLang({
        storage: {
          useValue: ssrStorage,
        },
      }),
    ],
  });

  let setActiveLangSpy: MockInstance<
    (typeof TranslocoPersistLangService.prototype)['setActiveLang']
  >;
  let saveSpy: MockInstance<
    (typeof TranslocoPersistLangService.prototype)['save']
  >;
  let getItemSpy: MockInstance<PersistStorage['getItem']>;
  let removeItemSpy: MockInstance<PersistStorage['removeItem']>;

  beforeEach(() => {
    ssrStorage.storage.clear();
    // A value the service would pick up if it (wrongly) ran init() on the server.
    ssrStorage.storage.set('translocoLang', 'de');

    // The project runs with `restoreMocks: false`, so a prototype spy re-created
    // here keeps the call history from service instances built by earlier
    // suites. Clear it so these assertions only see our own instances.
    setActiveLangSpy = vi
      .spyOn(TranslocoPersistLangService.prototype as any, 'setActiveLang')
      .mockClear();
    saveSpy = vi
      .spyOn(TranslocoPersistLangService.prototype as any, 'save')
      .mockClear();
    getItemSpy = vi.spyOn(ssrStorage, 'getItem');
    removeItemSpy = vi.spyOn(ssrStorage, 'removeItem');
  });

  afterEach(() => {
    delete (globalThis as { ngServerMode?: boolean }).ngServerMode;
    vi.restoreAllMocks();
  });

  describe('via ngServerMode', () => {
    beforeEach(() => {
      (globalThis as { ngServerMode?: boolean }).ngServerMode = true;
    });

    it(`GIVEN ngServerMode is true
        WHEN the service is constructed
        THEN init() is skipped: no active lang is set, storage is not read, and
             later language changes are not persisted`, () => {
      const spectator = serviceFactory();

      expect(setActiveLangSpy).not.toHaveBeenCalled();
      expect(getItemSpy).not.toHaveBeenCalled();

      spectator.inject(TranslocoService).setActiveLang('es');
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it(`GIVEN ngServerMode is true
        WHEN getCachedLang is called
        THEN returns null without reading storage`, () => {
      const spectator = serviceFactory();

      expect(spectator.service.getCachedLang()).toBeNull();
      expect(getItemSpy).not.toHaveBeenCalled();
    });

    it(`GIVEN ngServerMode is true
        WHEN clear is called
        THEN it is a no-op`, () => {
      const spectator = serviceFactory();

      spectator.service.clear();
      expect(removeItemSpy).not.toHaveBeenCalled();
    });
  });

  describe('via PLATFORM_ID', () => {
    it(`GIVEN PLATFORM_ID is 'server' and ngServerMode is unset
        WHEN the service is constructed
        THEN init() is skipped and getCachedLang returns null`, () => {
      const spectator = serviceFactory({
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
      });

      expect(setActiveLangSpy).not.toHaveBeenCalled();
      expect(spectator.service.getCachedLang()).toBeNull();
    });
  });
});
