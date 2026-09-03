# Template Authoring

Templates are versioned production assets, not runtime AI code.

## Salon & Spa master — ÉLANE v8

Phase 3 uses the user-provided `elane-v8-exact-same-version.zip` as the Salon & Spa visual master.

Template identity:

- ID: `elane-v8`
- Version: `8.0.0`
- Niche: `salon-and-spa`
- Archetype: `premium-cinematic-salon-spa`
- Original SHA-256: `ed9e8d651e0d24a759968f10febdb43d8ea7d036e53727d3cee8521ad7886dbf`

The repository keeps two source files:

- `packages/templates/source/elane-v8/original.html.gz.b64` — lossless gzip storage of the untouched uploaded HTML. CI decompresses it and enforces the original SHA-256.
- `scripts/prepare-elane-v8.mjs` — deterministic adapter that verifies the source fingerprint before adding engine hooks.
- `packages/templates/generated/elane-v8/index.html` — generated, git-ignored runtime source. Visual CSS, markup, breakpoints, scroll choreography, and motion system remain the ÉLANE v8 design; only small engine hooks are added.

The adapted source may add only infrastructure needed by the demo engine, such as:

- immutable template metadata
- `noindex,nofollow,noarchive`
- the Shalcon runtime config marker
- the config-driven finder-data hook
- evidence-safe disclosure copy

Do not redesign ÉLANE inside the runtime adapter.

## Runtime contract

The engine never generates a new website codebase for a prospect.

It performs:

`ÉLANE v8 source + validated SalonTemplateConfig -> rendered private demo document`

Prospect-specific values are injected with DOM `textContent`, safe URL assignment, and controlled CSS variables. Runtime prospect data is never inserted as arbitrary HTML.

Supported personalization includes:

- business name
- descriptor
- city / area
- hero copy
- belief copy
- four service / ritual panels
- ritual finder options
- visit process
- space copy
- verified testimonials
- verified FAQ content
- booking/contact copy
- approved image overrides
- controlled theme palette
- concept disclosure

## Evidence-safe fallbacks

**No evidence, no claim.**

When optional prospect information is absent:

- fewer than four verified services -> hide the cinematic ritual/finder sections instead of inventing services
- no verified process -> hide the process section
- no verified space description -> hide the space section
- no verified testimonials -> hide guest notes
- no verified FAQ facts -> hide FAQ
- no verified contact -> retain the visual booking concept but disable booking inputs and state that contact details are withheld until verified
- no prospect image -> retain the approved template image rather than pretending it belongs to the prospect

Template images are presentation assets. Copy must never describe them as the prospect’s real staff, customers, premises, or equipment unless verified prospect-owned assets replace them.

## Required template standard

Every future template requires:

1. template ID
2. immutable version
3. niche
4. archetype
5. source provenance / fingerprint where applicable
6. supported fields
7. required fields
8. section list
9. fallback behavior
10. ThemeDNA options
11. asset slots
12. fixture configs
13. desktop browser QA
14. mobile browser QA
15. sparse-data QA
16. visual evidence screenshots
17. manual Shalcon visual approval

A sent demo must always remain a clearly disclosed, private concept preview. It must never present itself as the business’s official live website.
