# Housepoint

Point your phone at any house in Massachusetts, Connecticut, New Jersey or Florida and see its story: when it was built, what it last sold for, and what it's valued at.

**Live:** https://mjillson85.github.io/Housepoint/

## How it works
- Phone GPS + compass work out which property you're pointing at.
- Massachusetts: MassGIS statewide standardized assessor parcels.
- Connecticut: the Connecticut GIS Office's statewide CAMA and Parcel Layer (town assessor records, public domain). Near the Massachusetts line both states' records load together.
- New Jersey: the NJ Office of GIS statewide parcels joined to the state's MOD-IV tax list (assessed value, last sale, year built, and last year's actual tax bill). Towns assess at different shares of market value, so the app doesn't compare New Jersey values to sale prices.
- Florida: the Florida Geographic Information Office's statewide parcel layer (Dept. of Revenue tax roll from county property appraisers).
- Owner names are never requested or shown, in any state. No accounts, ads or tracking; fonts are served from this site. See [privacy.html](privacy.html).
- Aerial photos: MassGIS 2025 aerial imagery in Massachusetts (15 cm, leaf-off), USGS NAIP elsewhere and as a fallback.
- Building outlines (to aim at roofs, not lawns): MassGIS Building Structures; FEMA/ORNL USA Structures in Connecticut, New Jersey and Florida, with Florida's statewide footprints as a backup.
- Flood zone: FEMA National Flood Hazard Layer. Ground elevation: USGS Elevation Point Query Service.
- "Thinking of buying?" (on each card, loaded when opened): listing links (Zillow, a listings search), the nearest public schools and school district (NCES), Census tract figures next to the state's (American Community Survey), the local police department's crime rates from the FBI, and distances to groceries, transit, parks and more (OpenStreetMap). Free keys go in `KEYS` near the top of that section of index.html: a Census key (api.census.gov/data/key_signup.html) and an api.data.gov key for the FBI. Both are free rate-limit keys, not secrets.
- Estimated property tax: assessed value × the town's FY2026 residential rate (Massachusetts Division of Local Services); assessed value (70% of the town's appraisal) × the town's FY2026 mill rate (Connecticut OPM); last year's actual bill from the MOD-IV tax list (New Jersey); or the county's taxable value × its average tax rate (Florida TaxWatch, from Dept. of Revenue data). It's an estimate, not the actual bill.

## Features
- **Point mode:** aim at a house and tap for its card. Small tags float over the other houses in view (year built and value); tap one to open it. "Labels on/off" hides them.
- **Card:** year built, value, last sale, estimated property tax, lot, flood zone and ground elevation, and a shareable image.
- **Map:** color every lot by age, value or last sale year, with a legend.
- **Monthly cost:** in "Thinking of buying?", a mortgage calculator that starts from the card's own numbers (price, estimated tax, the state's average insurance) and Freddie Mac's latest 30-year rate. Type the asking price or your own rate; down payment and loan length are remembered.
- **Nearby:** walk or drive times to the closest grocery, pharmacy, park, train and more, a map with ¼, ½ and 1 mile rings (USGS base map), and filters for groceries, dining, parks, transit and health.
- **Save & compare:** star a house on its card; the Saved tab lines starred houses up side by side (value, last sale, tax, monthly cost, size, flood zone, nearest school and grocery). Saved houses stay on the phone.

## Try it
- Open the live link in Safari or Chrome on your phone, tap **Start pointing**, and allow camera, location and motion.
- Add `?demo=1` to the URL to explore a made-up neighborhood without going outside.
- Add `?debug=1` to see the compass, GPS and camera view readings.
- If the floating tags are all shifted to one side of the houses, that's compass error: `?decl=` sets the compass correction (about −14 in Massachusetts, −13 in Connecticut, −12 in New Jersey, −7 in Florida). If tags are spread too far apart or bunched together, `?fov=` sets how wide the camera view is, in degrees (about 34 on an iPhone held upright).

It's a single file (`index.html`), no build step.
