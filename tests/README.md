# Housepoint tests

Each `test_*.mjs` opens `../index.html` in headless Chrome (puppeteer-core) and checks one area of the app.
The public services are faked inside the tests, so they run without a network connection.

    cd tests
    npm install
    npm test

Set `CHROME=/path/to/chrome` if Chrome isn't at `/usr/bin/google-chrome`. Run one file with `node test_more.mjs`.

| File | What it covers |
|---|---|
| test_inside | Aiming: the house under the circle wins over the lot you're standing on; tags only on houses near and wide enough on screen; no blinking |
| test_aim | Aiming with a real phone's error (GPS σ 5 m, compass σ 10°) from spots along the demo street: how often the house you meant comes first and within three "Not it" taps, by distance; the label holds steady while the compass jitters |
| test_point, test_tags, test_label | Point mode, floating tags, the live label |
| test_features, test_fixes | Card, map, flood zone, share, earlier bug fixes |
| test_more | Monthly cost calculator, save & compare, nearby map |
| test_buy, test_buy2 | "Thinking of buying?": schools, Census, FBI, nearby places, backups when a service fails |
| test_ct, test_nj, test_nc, test_wi, test_wa, test_ne, test_mn, test_dc, test_md, test_regions | Connecticut, New Jersey, North Carolina, Wisconsin, Washington, Nebraska, Minnesota, DC, Maryland, state borders |
| test_extras | Screen kept awake while pointing, feet and miles, price per square foot |
| test_tax, test_park, test_condo | Tax estimates, mobile home parks, condos |
| test_camera | Camera on only while pointing: off on the map and in the background, back on when you return, never asked for by map-only users, no stray or doubled camera requests |
| test_search | Map search: exact lot, Census geocoder, a town on its own (TIGERweb), Geoapify with the Census as backup, outside the covered states, no match, slow services, escaping |
| test_compass | Compass accuracy warning (iPhone): hint, heading-pill dot, one toast per episode, value on the `?debug=1` overlay |
| test_real | Every real lot in `fixtures/` (captured from the covered states' services) gets a card that follows the rules: stores, offices and land aren't homes, a condo's master record isn't a unit, a nominal deed isn't a price, a real sale shows, no broken values; plus "copy this lot's records" and the `?health=1` service check |

## Real records

`fixtures/real-*.json` hold a few hundred real lots from all the covered states: every kind of lot around sample spots
(downtowns, suburbs, the countryside, the shore), plus lots that showed problems. Only the fields the app asks for
are kept, so there are no owner names. They're captured on GitHub by `capture/capture.mjs` (the "capture real
records" workflow; run it from the Actions tab to refresh them), because the public services can't be reached
from everywhere.

A card that looks wrong on the phone: tap "Card look wrong? Copy this lot's records" at the bottom of the card,
save what was copied as a file, and run `node capture/add-lot.mjs that-file.json "what was wrong"`. The lot is then
part of `test_real` from then on.
