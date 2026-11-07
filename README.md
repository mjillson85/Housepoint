# Housepoint

Point your phone at any house in Massachusetts and see its story: when it was built, its style, what it last sold for, and what the town assesses it at.

**Live:** https://mjillson85.github.io/housepoint/ (once GitHub Pages is on)

## How it works
- Phone GPS + compass work out which property you're pointing at.
- Property facts come from MassGIS's statewide standardized assessor parcels (public data). Owner names are never requested or shown.
- Aerial photos: Esri World Imagery, with USGS NAIP as a fallback.

## Try it
- Open the live link in Safari or Chrome on your phone, tap **Start pointing**, and allow camera, location and motion.
- Add `?demo=1` to the URL to explore a made-up neighborhood without going outside.

It's a single file (`index.html`), no build step.
