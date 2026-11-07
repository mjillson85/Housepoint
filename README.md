# Housepoint

Point your phone at any house in Massachusetts or Florida and see its story: when it was built, what it last sold for, and what it's valued at.

**Live:** https://mjillson85.github.io/housepoint/ (once GitHub Pages is on)

## How it works
- Phone GPS + compass work out which property you're pointing at.
- Massachusetts: MassGIS statewide standardized assessor parcels.
- Florida: the Florida Geographic Information Office's statewide parcel layer (Dept. of Revenue tax roll from county property appraisers).
- Owner names are never requested or shown, in either state.
- Aerial photos: Esri World Imagery, with USGS NAIP as a fallback.

## Try it
- Open the live link in Safari or Chrome on your phone, tap **Start pointing**, and allow camera, location and motion.
- Add `?demo=1` to the URL to explore a made-up neighborhood without going outside.

It's a single file (`index.html`), no build step.
