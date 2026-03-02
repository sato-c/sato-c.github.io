function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createStorageMock() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    get length() {
      return map.size;
    }
  };
}

class MockElement {
  constructor(tagName, documentRef) {
    this.tagName = tagName;
    this._documentRef = documentRef;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.className = '';
    this._classSet = new Set();
    this.classList = {
      add: (...classNames) => {
        for (const className of classNames) this._classSet.add(className);
      },
      remove: (...classNames) => {
        for (const className of classNames) this._classSet.delete(className);
      },
      contains: (className) => this._classSet.has(className)
    };
    this.textContent = '';
    this.id = '';
  }

  appendChild(child) {
    this.children.push(child);
    if (child.id) {
      this._documentRef._elementsById.set(child.id, child);
    }
    return child;
  }

  remove() {
    if (this.id) {
      this._documentRef._elementsById.delete(this.id);
    }
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  addEventListener() {}

  removeEventListener() {}
}

function createDocumentMock() {
  const doc = {
    _elementsById: new Map(),
    createElement(tag) {
      return new MockElement(tag, doc);
    },
    getElementById(id) {
      return doc._elementsById.get(id) || null;
    },
    body: null
  };
  doc.body = new MockElement('body', doc);
  return doc;
}

function setupEnvironment() {
  const listeners = {};
  globalThis.window = {
    listeners,
    location: {
      origin: 'https://example.test',
      pathname: '/app',
      search: '',
      hash: ''
    },
    addEventListener(type, callback) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(callback);
    },
    removeEventListener(type, callback) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((cb) => cb !== callback);
    }
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true
  });
  globalThis.history = { replaceState() {} };
  globalThis.localStorage = createStorageMock();
  globalThis.sessionStorage = createStorageMock();
  globalThis.document = createDocumentMock();
}

async function run() {
  setupEnvironment();

  const { MessageBus } = await import('../core/message-bus.js');
  const { I18n } = await import('../core/i18n.js');
  const { StorageManager } = await import('../storage/storage-manager.js');
  const { APIManager } = await import('../api/api-manager.js');
  const { AuthManager } = await import('../auth/auth-manager.js');
  const { SyncManager } = await import('../storage/sync-manager.js');
  const { PanelManager } = await import('../ui/panel-manager.js');
  const { SystemUIManager } = await import('../ui/system-ui-manager.js');
  const { GoogleOAuthAdapter } = await import('../auth/adapters/google-oauth-adapter.js');

  // 1) StorageManager init idempotency
  StorageManager.adapter = {
    async save() { return true; },
    load() { return null; },
    async remove() { return true; },
    getAllKeys() { return []; }
  };
  StorageManager.initialized = false;
  await StorageManager.init();
  await StorageManager.init();
  assert(window.listeners.online.length === 1, 'StorageManager registered online listener more than once');
  assert(window.listeners.offline.length === 1, 'StorageManager registered offline listener more than once');
  StorageManager.destroy();
  await StorageManager.init();
  assert(window.listeners.online.length === 1, 'StorageManager destroy/init did not reset listeners correctly');
  assert(window.listeners.offline.length === 1, 'StorageManager destroy/init did not reset listeners correctly');

  // 2) APIManager init idempotency
  APIManager.initialized = false;
  APIManager.init();
  APIManager.init();
  assert(window.listeners.online.length === 2, 'APIManager online listener count is unexpected');
  assert(window.listeners.offline.length === 2, 'APIManager offline listener count is unexpected');
  APIManager.destroy();
  APIManager.init();
  assert(window.listeners.online.length === 2, 'APIManager destroy/init did not reset listeners correctly');
  assert(window.listeners.offline.length === 2, 'APIManager destroy/init did not reset listeners correctly');

  // 3) AuthManager init idempotency
  let authInitCount = 0;
  let callbackCount = 0;
  AuthManager.adapter = {
    init() { authInitCount += 1; },
    async handleCallback() { callbackCount += 1; return false; },
    login() {},
    logout() {},
    getToken() { return null; },
    isAuthenticated() { return false; },
    getUserInfo() { return null; }
  };
  AuthManager.initialized = false;
  await AuthManager.init();
  await AuthManager.init();
  assert(authInitCount === 1, 'AuthManager.adapter.init called more than once');
  assert(callbackCount === 1, 'AuthManager.adapter.handleCallback called more than once');
  AuthManager.destroy();
  await AuthManager.init();
  assert(authInitCount === 2, 'AuthManager destroy/init did not re-run adapter.init');

  // 4) PanelManager/SystemUIManager idempotency on MessageBus subscriptions
  const originalOn = MessageBus.on.bind(MessageBus);
  const onCalls = [];
  MessageBus.on = (action, callback) => {
    onCalls.push(action);
    return originalOn(action, callback);
  };

  PanelManager.initialized = false;
  PanelManager.init({ containerId: 'panel-container' });
  PanelManager.init({ containerId: 'panel-container' });

  SystemUIManager.initialized = false;
  SystemUIManager.init();
  SystemUIManager.init();

  const saveSubscribeCount = onCalls.filter((a) => a === 'request-save').length;
  const saveImmediateSubscribeCount = onCalls.filter((a) => a === 'request-save-immediate').length;
  const notificationSubscribeCount = onCalls.filter((a) => a === 'show-notification').length;

  assert(saveSubscribeCount === 1, 'PanelManager subscribed request-save more than once');
  assert(saveImmediateSubscribeCount === 1, 'PanelManager subscribed request-save-immediate more than once');
  assert(notificationSubscribeCount === 1, 'SystemUIManager subscribed show-notification more than once');
  PanelManager.destroy();
  SystemUIManager.destroy();

  onCalls.length = 0;
  PanelManager.init({ containerId: 'panel-container' });
  SystemUIManager.init();
  const saveSubscribeCountAfterDestroy = onCalls.filter((a) => a === 'request-save').length;
  const notificationSubscribeCountAfterDestroy = onCalls.filter((a) => a === 'show-notification').length;
  assert(saveSubscribeCountAfterDestroy === 1, 'PanelManager destroy/init did not re-subscribe correctly');
  assert(notificationSubscribeCountAfterDestroy === 1, 'SystemUIManager destroy/init did not re-subscribe correctly');

  MessageBus.on = originalOn;

  // 4.1) PanelManager bringToFront should update .panel--active
  const panelA = { element: new MockElement('div', document), config: { id: 'a' } };
  const panelB = { element: new MockElement('div', document), config: { id: 'b' } };
  PanelManager.panels = new Map([
    ['a', panelA],
    ['b', panelB]
  ]);
  PanelManager.currentZIndex = 20;
  PanelManager.bringToFront('a');
  assert(panelA.element.classList.contains('panel--active'), 'bringToFront did not activate target panel');
  PanelManager.bringToFront('b');
  assert(!panelA.element.classList.contains('panel--active'), 'bringToFront did not clear previous active panel');
  assert(panelB.element.classList.contains('panel--active'), 'bringToFront did not activate new panel');

  // 4.2) I18n locale behavior
  assert(I18n.getLocale() === 'ja', 'I18n default locale should be ja');
  assert(I18n.t('ui.common.cancel') === 'キャンセル', 'I18n ja resource mismatch');
  I18n.setLocale('en');
  assert(I18n.t('ui.common.cancel') === 'Cancel', 'I18n en resource mismatch');
  I18n.setLocale('ja');

  // 5) APIManager auth cache key separation
  let tokenValue = 'token-A';
  AuthManager.adapter = {
    init() {},
    async handleCallback() { return false; },
    login() {},
    logout() {},
    getToken() { return tokenValue; },
    isAuthenticated() { return true; },
    getUserInfo() { return null; }
  };

  const keyA = await APIManager.buildCacheKey('/v1/items', { auth: true });
  tokenValue = 'token-B';
  const keyB = await APIManager.buildCacheKey('/v1/items', { auth: true });
  assert(keyA !== keyB, 'APIManager auth cache key is not user-separated');

  // 6) SyncManager backup checks false-return failure path
  StorageManager.adapter = {
    async save() { return true; },
    load() { return null; },
    async remove() { return true; },
    getAllKeys() { return []; }
  };
  SyncManager.adapter = {
    async save() { return false; },
    async load() { return null; }
  };
  const backupResult = await SyncManager.backup({ x: 1 });
  assert(backupResult === false, 'SyncManager.backup should fail when adapter.save returns false');

  // 7) GoogleOAuthAdapter expires_in validation
  const oauth = new GoogleOAuthAdapter({ clientId: 'dummy-client' });
  sessionStorage.setItem('oauth_state', 'state-1');
  window.location.hash = '#access_token=tkn&expires_in=invalid&state=state-1';

  let invalidExpiresThrown = false;
  try {
    await oauth.handleCallback();
  } catch (error) {
    invalidExpiresThrown = String(error?.message || '').includes('Invalid expires_in');
  }
  assert(invalidExpiresThrown, 'GoogleOAuthAdapter should throw on invalid expires_in');

  console.log('Smoke tests passed');
}

run().catch((error) => {
  console.error('Smoke tests failed:', error.message);
  process.exit(1);
});
