# Housepoint

Point your phone at any house in Massachusetts or Florida and see its story: when it was built, what it last sold for, and what it's valued at.

**Live:** https://mjillson85.github.io/Housepoint/

## How it works
- Phone GPS + compass work out which property you're pointing at.
- Massachusetts: MassGIS statewide standardized assessor parcels.
- Florida: the Florida Geographic Information Office's statewide parcel layer (Dept. of Revenue tax roll from county property appraisers).
- Owner names are never requested or shown, in either state.
- Aerial photos: Esri World Imagery, with USGS NAIP as a fallback.
- Flood zone: FEMA National Flood Hazard Layer (Esri's hosted copy as a fallback). Ground elevation: USGS Elevation Point Query Service.

## Features
- **Point mode:** aim at a house and tap for its card. Small tags float over the other houses in view (year built and value); tap one to open it. "Labels on/off" hides them.
- **Card:** year built, value, last sale, lot, flood zone and ground elevation, and a shareable image.
- **Map:** color every lot by age, value or last sale year, with a legend.

## Try it
- Open the live link in Safari or Chrome on your phone, tap **Start pointing**, and allow camera, location and motion.
- Add `?demo=1` to the URL to explore a made-up neighborhood without going outside.
- Add `?debug=1` to see the compass, GPS and camera view readings. If the floating tags sit off to one side of the houses, `?fov=40` (or another number) sets how wide the camera view is, in degrees.

It's a single file (`index.html`), no build step.
