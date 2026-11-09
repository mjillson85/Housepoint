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
| test_tax, test_park, test_condo | Tax estimates, mobile home parks, condos |
