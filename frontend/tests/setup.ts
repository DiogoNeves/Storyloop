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
    const mediaQuery = {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };

    // Default to light mode for tests
    if (query === "(prefers-color-scheme: dark)") {
      mediaQuery.matches = false;
    }

    return mediaQuery;
  },
});
