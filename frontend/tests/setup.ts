import "@testing-library/jest-dom/vitest";
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
