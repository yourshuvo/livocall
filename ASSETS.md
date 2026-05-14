# LivoCall — Asset Inventory

Every image / SVG / illustration the marketing site, dashboard and auth screens
need. Most are placeholders today (either inline SVG, CSS gradients, or the two
PNGs bundled in `apps/web/public/`). This file is the single source of truth
for "what to swap" before going public.

Search the codebase for `TODO(asset)` to jump straight to where each one is
used.

Files in `apps/web/public/`

| file | size on disk | format | currently used at | status |
| ---- | ------------ | ------ | ----------------- | ------ |
| `hero-clouds.png`     | 3.6 MB | PNG, 1568×893, halftone monochrome | homepage hero, auth side panel | **placeholder** — replace |
| `hero-landscape.jpg`  | 168 KB | JPEG, 1717×916, sky + green hills  | (no longer referenced)         | **delete** |
| `manifest.webmanifest`| 376 B  | JSON                               | PWA manifest                   | OK   |

---

## Marketing site — `/` (homepage)

### `hero.background` — full-viewport cinematic image
- **Where**: `apps/web/src/app/page.tsx` — hero section, `bg-[url('/hero-clouds.png')]`
- **Current**: halftone B/W cloud composite (`/hero-clouds.png`)
- **Replace with**: an editorial, monochrome (or near-monochrome) photo /
  illustration that reads at 100 vh full-bleed. Dark at the top + bottom-left
  so the white headline + CTAs are legible without an additional overlay.
- **Recommended specs**:
  - `2880×1620` (or larger), exported as `webp` + `jpg` fallback
  - Optimised < 250 KB for `webp`, < 400 KB for `jpg`
  - sRGB
  - Crop respects the rule of thirds — important content lives in the
    top-right and bottom-right thirds
- **Filename when shipped**: `apps/web/public/hero.webp` (and `hero.jpg`).
  Update the `bg-[url(...)]` reference in `page.tsx` and `(auth)/layout.tsx`.

### `hero.poster` — Open Graph / Twitter card
- **Where**: `apps/web/src/app/layout.tsx` `metadata.openGraph.images` (currently `none`)
- **Replace with**: 1200×630 `png` / `jpg` summarising the hero — wordmark
  bottom-left, headline top-left, hero image as the right two-thirds.
- **Filename**: `apps/web/public/og.png`

### `dashboardPreview.background` — "Inside the dashboard" mockup
- **Where**: `apps/web/src/components/marketing/dashboard-preview.tsx`
- **Current**: pure CSS — sidebar + cards drawn entirely in markup, no images
- **Replace with**: optional. If you want a richer screenshot, export a 16:10
  PNG of the real `/overview` at 1440×900, save as
  `apps/web/public/dashboard-preview.png`, and swap the CSS mockup for an
  `<Image src="/dashboard-preview.png" />` inside the same panel frame.

### `useCases.icons` — six industry tiles
- **Where**: `apps/web/src/components/marketing/use-cases.tsx`
- **Current**: lucide-react icons (`shopping-cart`, `landmark`, `stethoscope`,
  `store`, `graduation-cap`, `headphones`)
- **Replace with**: optional. Custom monoline SVGs at 24×24 in
  `apps/web/public/icons/use-case/<slug>.svg`. Keep stroke-width 1.5 to match
  the rest of lucide.

### `logoStrip.providers` — "plays nicely with the providers you already trust"
- **Where**: `apps/web/src/components/marketing/logo-strip.tsx`
- **Current**: hand-rolled inline SVG wordmarks for Gemini, Deepgram, Cartesia,
  FreeSWITCH, Pipecat, MongoDB, bKash, Nagad
- **Replace with**: real brand SVGs once you have written permission to use
  them. Drop them in `apps/web/public/logos/<slug>.svg` (monochrome, single
  path, 120×40 viewBox), and replace the inline `<svg>` elements with
  `<img src="/logos/<slug>.svg" alt="<Brand>" />`.
- **Legal**: do not ship third-party logos until you have either (a) explicit
  brand-guideline permission or (b) a signed partnership.

### `testimonials.avatars` — three quoted operators
- **Where**: `apps/web/src/components/marketing/testimonials.tsx`
- **Current**: monogram circles ("TK", "AH", "SR") drawn in CSS
- **Replace with**: square portraits at 96×96 PNG (or WebP). Save as
  `apps/web/public/testimonials/<slug>.png` and swap the monogram for
  `<Image src="/testimonials/<slug>.png" alt="<Name>" width={48} height={48} />`.
  Keep the CSS monogram as a fallback in `<noscript>` / loading state.

### `flow.icons` — call-flow diagram
- **Where**: `apps/web/src/components/marketing/flow-diagram.tsx`
- **Current**: lucide icons (`phone`, `network`, `cpu`, `sparkles`)
- **Replace with**: optional, see useCases above.

### `comparisonTable.icons` — check / dash marks
- **Where**: `apps/web/src/components/marketing/comparison-table.tsx`
- **Current**: lucide `check` and `minus`
- **Replace with**: nothing — these are functional icons.

### `videoTeaser.poster` — "Tour the dashboard" play button
- **Where**: `apps/web/src/components/marketing/dashboard-preview.tsx`, the
  `live demo · 3 min` link
- **Current**: text-only, no real video
- **Replace with**: a 60–90 s screen recording of the dashboard. Host on
  Cloudflare Stream / Mux. Wire the link to a `<dialog>` that loads the player.

---

## Auth — `/login`, `/signup`, `/password-reset`, `/invites/[token]`

### `auth.sidePanel` — left-column hero block
- **Where**: `apps/web/src/app/(auth)/layout.tsx`, `<div className="bg-[url('/hero-clouds.png')]" />`
- **Current**: shares `/hero-clouds.png` with the marketing hero, cropped to
  160 px × full-width
- **Replace with**: any of (a) a tighter crop of the homepage hero, (b) a
  dedicated 800×600 image, or (c) keep as-is and just update both references at
  once. Whatever you choose, save as `apps/web/public/auth-side.webp`.

### `auth.metricStrip` — round-trip / pricing / compliance / language tiles
- **Where**: `apps/web/src/components/marketing/metric-strip.tsx`
- **Current**: lucide icons + text only
- **Replace with**: nothing required. Keep functional.

---

## Dashboard — `/(app)/*`

### `dashboard.appLogo` — sidebar wordmark + favicon
- **Where**: `apps/web/src/components/wordmark.tsx`, `apps/web/src/app/layout.tsx` favicon
- **Current**: plain text wordmark (`livocall`)
- **Replace with**: optional logo lockup. If you commission one, save as:
  - `apps/web/public/icon-32.png` — favicon
  - `apps/web/public/icon-192.png` — PWA
  - `apps/web/public/icon-512.png` — PWA
  - `apps/web/public/apple-touch-icon.png` — iOS home-screen
  - `apps/web/public/livocall-mark.svg` — nav lockup (height 18 px)

### `dashboard.emptyStates` — "no calls yet", "no agents yet", "no numbers"
- **Where**:
  - `apps/web/src/app/(app)/calls/page.tsx`
  - `apps/web/src/app/(app)/agents/page.tsx`
  - `apps/web/src/app/(app)/numbers/page.tsx`
  - `apps/web/src/app/(app)/knowledge/page.tsx`
- **Current**: lucide icon in a square + text only
- **Replace with**: optional. If you want richer empty states, commission six
  64×64 SVG illustrations and save under
  `apps/web/public/empty/<slug>.svg`.

### `dashboard.providerLogos` — SIP connections
- **Where**:
  - `apps/web/src/app/(app)/connections/client.tsx`
- **Current**: users type any provider name as plain text
- **Replace with**: same brand SVGs as `logoStrip.providers` above. Reuse
  `/logos/<slug>.svg` from public/.

### `dashboard.callRecordingWaveform` — `/calls/[id]` audio replay
- **Where**: `apps/web/src/app/(app)/calls/[id]/page.tsx`
- **Current**: HTML5 `<audio>` controls only — no waveform visualisation
- **Replace with**: optional. If you want a wavesurfer-style waveform, render
  it client-side from the `audioUrl`. No image needed.

---

## Legal — `/legal/privacy`, `/legal/terms`, `/legal/aup`

### No images — text only.

---

## Status — `/status`

### `status.componentIcons`
- **Where**: `apps/web/src/app/status/page.tsx`
- **Current**: filled green / red dots in CSS
- **Replace with**: nothing. Functional.

---

## Email — magic link / invites / password reset

### `email.headerLogo`
- **Where**: `apps/web/src/lib/mailer.ts` (HTML body)
- **Current**: plain `livocall` text
- **Replace with**: a 240×80 `png` wordmark hosted at
  `https://app.livocall.ai/email/header.png` (must be a public URL —
  email clients can't load relative paths). Add the file to
  `apps/web/public/email/header.png`.

---

## SDK + docs

### `sdk.coverImage`
- **Where**: `packages/sdk-node/README.md`
- **Current**: text only
- **Replace with**: optional. A 1200×400 PNG banner (same theme as marketing
  hero) at `packages/sdk-node/cover.png`.

---

## Sourcing checklist (in order of impact)

1. **`hero-clouds.png`** — single biggest visual lever. Replace this and 80%
   of the "needs a designer" feel goes away.
2. **`og.png`** — every shared link looks generic until this exists.
3. **`logos/<provider>.svg`** — replace inline SVGs once you have brand
   permission. Until then, lean on text-only logo strip.
4. **`testimonials/<slug>.png`** — only worth doing once you have real
   testimonials.
5. **Favicon + PWA icons** — small but every browser tab shows it.

---

## Conventions

- Always export both `webp` + `jpg` fallback for raster images.
- SVGs must be optimised with `svgo` before commit.
- File names: `kebab-case` only.
- Never embed images as `data:` URIs in TSX — always reference
  `apps/web/public/...`.
- Never commit binaries > 500 KB without `git lfs` (we don't have lfs set up
  yet — keep raster images compressed).
- No CDN-hosted images in HTML/CSS. Self-host everything in `public/` so
  the site works in air-gapped Coolify deployments.
