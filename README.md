# Housepoint

Point your phone at any house in Massachusetts or Florida and see its story: when it was built, what it last sold for, and what it's valued at.

**Live:** https://mjillson85.github.io/Housepoint/

## How it works
- Phone GPS + compass work out which property you're pointing at.
- Massachusetts: MassGIS statewide standardized assessor parcels.
- Florida: the Florida Geographic Information Office's statewide parcel layer (Dept. of Revenue tax roll from county property appraisers).
- Owner names are never requested or shown, in either state. No accounts, ads or tracking; fonts are served from this site. See [privacy.html](privacy.html).
- Aerial photos: MassGIS 2025 aerial imagery in Massachusetts (15 cm, leaf-off), USGS NAIP elsewhere and as a fallback.
- Building outlines (to aim at roofs, not lawns): MassGIS Building Structures; FEMA/ORNL USA Structures and Florida's statewide footprints in Florida.
- Flood zone: FEMA National Flood Hazard Layer (Esri's hosted copy as a fallback). Ground elevation: USGS Elevation Point Query Service.
- Estimated property tax: assessed value × the town's FY2026 residential rate (Massachusetts Division of Local Services), or the county's taxable value × its average tax rate (Florida TaxWatch, from Dept. of Revenue data). It's an estimate, not the actual bill.

## Features
- **Point mode:** aim at a house and tap for its card. Small tags float over the other houses in view (year built and value); tap one to open it. "Labels on/off" hides them.
- **Card:** year built, value, last sale, estimated property tax, lot, flood zone and ground elevation, and a shareable image.
- **Map:** color every lot by age, value or last sale year, with a legend.

## Try it
- Open the live link in Safari or Chrome on your phone, tap **Start pointing**, and allow camera, location and motion.
- Add `?demo=1` to the URL to explore a made-up neighborhood without going outside.
- Add `?debug=1` to see the compass, GPS and camera view readings.
- If the floating tags are all shifted to one side of the houses, that's compass error: `?decl=` sets the compass correction (about −14 in Massachusetts, −7 in Florida). If tags are spread too far apart or bunched together, `?fov=` sets how wide the camera view is, in degrees (about 34 on an iPhone held upright).

It's a single file (`index.html`), no build step.
