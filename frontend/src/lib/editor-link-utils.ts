export function findClosestLinkElement(
  node: Node | null,
): HTMLAnchorElement | null {
  if (!node) {
    return null;
  }
  const element = node instanceof Element ? node : node.parentElement;
  const linkElement = element?.closest("a");
  return linkElement instanceof HTMLAnchorElement ? linkElement : null;
}
