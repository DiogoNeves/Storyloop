# Design Resources and Icon Guidelines

The design mockups in this folder rely on Lucide's icon set for consistent, open-source iconography.

## Working with Lucide Icons

- **Source of truth:** Use the official [Lucide library](https://lucide.dev/) when exploring or downloading icons.
- **Figma integration:** Enable the Lucide community file in Figma to mirror the visual style used in these mockups. Document any new icons referenced so engineers can locate them quickly.
- **Implementation handoff:** When providing specs, include the icon name as exported by Lucide. Developers should import icons from the `lucide-react` package to match the designs.
- **Customization:** Prefer the default 24px stroke icons. If you adjust stroke weight or sizing for design reasons, annotate the change in the handoff notes.

Keeping design assets aligned with Lucide ensures parity between the design artifacts and the React implementation.
