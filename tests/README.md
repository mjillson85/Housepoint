# Housepoint tests

Each `test_*.mjs` opens `../index.html` in headless Chrome (puppeteer-core) and checks one area of the app.
The public services are faked inside the tests, so they run without a network connection.

    cd tests
    npm install
    npm test

Set `CHROME=/path/to/chrome` if Chrome isn't at `/usr/bin/google-chrome`. Run one file with `node test_more.mjs`.

| File | What it covers |
|---|---|
| test_inside | Aiming: the house under the circle wins over the lot you're standing on; floating tags for distant houses |
| test_point, test_tags, test_label | Point mode, floating tags, the live label |
| test_features, test_fixes | Card, map, flood zone, share, earlier bug fixes |
| test_more | Monthly cost calculator, save & compare, nearby map |
| test_buy, test_buy2 | "Thinking of buying?": schools, Census, FBI, nearby places, backups when a service fails |
| test_ct, test_nj, test_regions | Connecticut, New Jersey, state borders |
| test_extras | Screen kept awake while pointing, feet and miles, price per square foot |
| test_tax, test_park, test_condo | Tax estimates, mobile home parks, condos |
| test_camera | Camera on only while pointing: off on the map and in the background, back on when you return, never asked for by map-only users, no stray or doubled camera requests |
| test_search | Map search: exact lot, Census geocoder, a town on its own (TIGERweb), Geoapify with the Census as backup, outside the four states, no match, slow services, escaping |
| test_compass | Compass accuracy warning (iPhone): hint, heading-pill dot, one toast per episode, value on the `?debug=1` overlay |
