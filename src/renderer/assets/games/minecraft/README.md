# Minecraft card art

Drop files here to replace the built-in illustrated fallback — nothing in the
code needs to change, `gameAssets.ts` picks them up automatically on the next
build/reload.

| File | Used for | Notes |
|---|---|---|
| `background.jpg` / `.png` / `.webp` | Full-bleed card background | Fills the card via `object-cover`; roughly 800x450 or wider looks best. |
| `logo.png` / `.svg` / `.webp` | Game logo over the artwork | Rendered with `object-contain` — never stretched. Transparent background recommended. |
| `overlay.png` / `.webp` (optional) | Extra image layer above the background | e.g. a texture, light leak, or vignette PNG. |

Only bundle art you have the rights to redistribute.
