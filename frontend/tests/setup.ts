import "@testing-library/jest-dom/vitest";

// Mock ResizeObserver for Recharts ResponsiveContainer
globalThis.ResizeObserver = class ResizeObserver {
  observe() {
    // no-op
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
};
