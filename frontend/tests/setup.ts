import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import "./mocks/conversationApi";

class ResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {
    // noop - jsdom doesn't lay out elements
  }

  unobserve() {
    // noop - jsdom doesn't lay out elements
  }

  disconnect() {
    // noop
  }
}

if (!globalThis.ResizeObserver) {
  // Vitest runs in a jsdom environment which does not implement ResizeObserver.
  // Recharts requires it to measure chart containers during render.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (globalThis as any).ResizeObserver = ResizeObserver;
}

// Mock window.matchMedia for theme preference detection
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => {
    const noop = () => undefined;
    const mediaQuery = {
      matches: false,
      media: query,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => false,
    };

    // Default to light mode for tests
    if (query === "(prefers-color-scheme: dark)") {
      mediaQuery.matches = false;
    }

    return mediaQuery;
  },
});

// Ensure localStorage is available with expected methods in tests.
if (
  !("localStorage" in window) ||
  typeof window.localStorage?.clear !== "function"
) {
  const storage = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size;
    },
  };

  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
  });
}
