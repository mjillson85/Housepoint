# Housepoint

Point your phone at any house in Massachusetts, Connecticut, New Jersey, Florida or North Carolina and see its story: when it was built, what it last sold for, and what it's valued at.

**Live:** https://mjillson85.github.io/Housepoint/

## How it works
- Phone GPS + compass work out which property you're pointing at.
- Massachusetts: MassGIS statewide standardized assessor parcels.
- Connecticut: the Connecticut GIS Office's statewide CAMA and Parcel Layer (town assessor records, public domain). Near the Massachusetts line both states' records load together.
- New Jersey: the NJ Office of GIS statewide parcels joined to the state's MOD-IV tax list (assessed value, last sale, year built, and last year's actual tax bill). Towns assess at different shares of market value, so the app doesn't compare New Jersey values to sale prices.
- Florida: the Florida Geographic Information Office's statewide parcel layer (Dept. of Revenue tax roll from county property appraisers).
- North Carolina: NC OneMap's statewide parcels (each county's tax records in one layer: tax value, year built, the date of the last sale but not its price, and each county's own use codes, read by their descriptions). A few counties send no use codes (the card says "Use not listed") or no addresses (Guilford, Orange).
- Owner names are never requested or shown, in any state. No accounts, ads or tracking; fonts are served from this site. See [privacy.html](privacy.html).
- Aerial photos: MassGIS 2025 aerial imagery in Massachusetts (15 cm, leaf-off), USGS NAIP elsewhere and as a fallback.
- Building outlines (to aim at roofs, not lawns): MassGIS Building Structures; FEMA/ORNL USA Structures in Connecticut, New Jersey, Florida and North Carolina, with Florida's statewide footprints as a backup.
- Flood zone: FEMA National Flood Hazard Layer. Ground elevation: USGS Elevation Point Query Service.
- Map search: an address with a house number is looked up in the state parcel services first (the exact lot); then the U.S. Census Bureau geocoder (free, no key) finds the address, and the Census Bureau's TIGERweb map finds a town on its own. When a Geoapify key is set, Geoapify's address search leads for streets and towns and backs up the Census for house numbers (it handles typos). What you type is sent to these services.
- "Thinking of buying?" (on each card, loaded when opened): listing links (Zillow, a listings search), the nearest public schools and school district (NCES), Census tract figures next to the state's (American Community Survey), the local police department's crime rates from the FBI, and distances to groceries, transit, parks and more (OpenStreetMap places via Geoapify, with public Overpass servers as a backup). Free keys go in `KEYS` near the top of that section of index.html: a Census key (api.census.gov/data/key_signup.html), an api.data.gov key for the FBI, and a Geoapify key (free plan, 3,000 credits a day). Both are free rate-limit keys, not secrets.
- Estimated property tax: assessed value × the town's FY2026 residential rate (Massachusetts Division of Local Services); assessed value (70% of the town's appraisal) × the town's FY2026 mill rate (Connecticut OPM); last year's actual bill from the MOD-IV tax list (New Jersey); the county's taxable value × its average tax rate (Florida TaxWatch, from Dept. of Revenue data); or the tax value × the county's FY2026–27 rate plus the town's (NC Department of Revenue), with the county-only figure for houses outside town limits. It's an estimate, not the actual bill.

## Features
- **Point mode:** aim at a house and tap for its card. The app allows for your phone's GPS and compass being a little off: it weighs every house the aim could really be on and picks the most likely, out to about 260 ft. When two are close it says "or …" so you can choose, and the label doesn't flick between neighbors as the phone wobbles. Small tags float over the other houses in view that are near and wide enough on screen to tag reliably; tap one to open it. "Labels on/off" hides them. Distances are to the house's edge, rounded to 10 ft.
- **Card:** year built, value, last sale, price per square foot, estimated property tax, lot, flood zone and ground elevation, and a shareable image with a link that opens the same house on the map (`?h=lat,lon&k=key`).
- **Pointing:** the screen stays awake while you point (where the phone supports it).
- **Map:** color every lot by age, value or last sale year, with a legend.
- **Monthly cost:** in "Thinking of buying?", a mortgage calculator that starts from the card's own numbers (price, estimated tax, the state's average insurance) and Freddie Mac's latest 30-year rate. Type the asking price or your own rate; down payment and loan length are remembered.
- **Nearby:** walk or drive times to the closest grocery, pharmacy, park, train and more, a map with ¼, ½ and 1 mile rings (USGS base map), and filters for groceries, dining, parks, transit and health.
- **Property types:** each record is read from its state's use codes (homes, condos, apartments, stores, offices, land, exempt property), so a store gets floor area instead of living area, a condo's master record and a strip of land on the same lot aren't counted as units, and the home-buyer tools appear only for homes.
- **Save & compare:** star a house on its card; the Saved tab lines starred houses up side by side (value, last sale, tax, monthly cost, size, flood zone, nearest school and grocery). Saved houses stay on the phone.

## Try it
- Open the live link in Safari or Chrome on your phone, tap **Start pointing**, and allow camera, location and motion.
- Add `?demo=1` to the URL to explore a made-up neighborhood without going outside.
- Add `?health=1` to check the data services: each state's property records and the address lookups, how fast they answer, and whether one has moved.
- Add `?aimpow=0.25` to change how much a house's on-screen width is discounted when picking (0 favors big near houses, 1 treats every house alike; 0.25 tested best).
- Add `?debug=1` to see the compass, GPS and camera view readings. On an iPhone the first line also shows the compass accuracy (`acc ±N°`); the app warns when it's worse than ±30°.
- If the floating tags are all shifted to one side of the houses, that's compass error: `?decl=` sets the compass correction (about −14 in Massachusetts, −13 in Connecticut, −12 in New Jersey, −7 in Florida, −9 in Raleigh). If tags are spread too far apart or bunched together, `?fov=` sets how wide the camera view is, in degrees (about 34 on an iPhone held upright).

It's a single file (`index.html`), no build step.

## Tests
`tests/` holds the automated checks (headless Chrome; the public services are faked, so no network is needed):

    cd tests && npm install && npm test

They also run on GitHub after every push (`.github/workflows/tests.yml`). One of them checks the cards of a few hundred real lots from all the covered states (`tests/fixtures/`, captured on GitHub by `.github/workflows/capture.yml`); see `tests/README.md`.
