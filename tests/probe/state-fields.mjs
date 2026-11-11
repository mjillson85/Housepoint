// Before a state is added: reads its parcel layer from a real browser page (as the phone asks) and logs its field names,
// which property-type codes it uses near a set of spots, and sample records at houses, condos and townhomes, so the
// state's field mapping and property types can be written from real records. Run by the "probe services" workflow.
// Only a list of property fields is ever requested: never owner names, mailing addresses or legal descriptions.
//   cd tests && node probe/state-fields.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8799);
const log = (...a) => console.log(...a);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8799/');

// Wisconsin and Washington are in git history (November 11, 2026).
const STATES = {
  NE: {
    layer: 'https://giscat.ne.gov/enterprise/rest/services/StatewideParcelsExternal/MapServer/0',
    want: ['OBJECTID', 'State_PID', 'Parcel_ID', 'Situs_Address', 'Ph_Rd_Num', 'Ph_Pre_Dir', 'Ph_Rd_Name', 'Ph_Rd_Type', 'Ph_Suf_Dir', 'Ph_City', 'Ph_Zip5',
      'Ph_Full_Address', 'Acres_Deeded', 'GIS_Acres', 'County_ID', 'ASSRLOC', 'Total_Assessed_Value', 'Land_Value', 'Improvements_Value', 'Other_Impr_Value',
      'Ag_Land_Value', 'Classification_Code', 'Property_Parcel_Status', 'Property_Parcel_Type', 'Zoning', 'Location', 'City_Size', 'Parcel_Size',
      'Property_SubClass', 'Ownership_Type', 'TAXDIST', 'School_District_Name', 'Sales_Date', 'Sales_Value', 'Sale_Useability', 'CAMAUpdate', 'ShapeUpdate',
      'Parcel_URL', 'BuildingYear', 'RCN', 'ImpSF', 'QualImp', 'CondImp', 'Neighborhood'],
    group: [['Property_Parcel_Type'], ['Property_Parcel_Status'], ['Ownership_Type'], ['Property_SubClass'], ['Sale_Useability'], ['Location']],
    codes: ['Property_Parcel_Type', 'Property_SubClass', 'Ownership_Type'],
    county: ['County_ID'],
    spots: [[41.2611, -95.9850, 'Omaha Dundee houses'], [41.2565, -95.9345, 'Omaha downtown condos'], [41.2340, -96.0100, 'Omaha Aksarben'],
      [40.7990, -96.6850, 'Lincoln near south'], [40.8136, -96.7026, 'Lincoln downtown'], [41.1370, -95.8908, 'Bellevue (Sarpy)'],
      [40.9250, -98.3420, 'Grand Island'], [40.6993, -99.0832, 'Kearney'], [41.1239, -100.7654, 'North Platte'], [41.8666, -103.6672, 'Scottsbluff'],
      [41.4000, -99.6400, 'Custer County (rural)']],
  },
  MN: {
    layer: 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/plan_parcels_open/MapServer/1',
    want: ['objectid', 'county_pin', 'state_pin', 'anumberpre', 'anumber', 'anumbersuf', 'st_pre_mod', 'st_pre_dir', 'st_pre_typ', 'st_pre_sep', 'st_name', 'st_pos_typ',
      'st_pos_dir', 'st_pos_mod', 'sub_type1', 'sub_id1', 'sub_type2', 'sub_id2', 'zip', 'ctu_name', 'postcomm', 'co_code', 'co_name', 'landmark', 'homestead',
      'acres_poly', 'acres_deed', 'emv_land', 'emv_bldg', 'emv_total', 'tax_year', 'mkt_year', 'tax_capac', 'total_tax', 'spec_asses', 'useclass1', 'useclass2',
      'useclass3', 'useclass4', 'multi_uses', 'tax_exempt', 'xuseclass1', 'xuseclass2', 'dwell_type', 'home_style', 'fin_sq_ft', 'garage', 'garagesqft', 'basement',
      'heating', 'cooling', 'year_built', 'num_units', 'sale_date', 'sale_value', 'green_acre', 'open_space', 'ag_preserv', 'edit_date', 'polyptrel', 'ownership',
      'school_dst'],
    group: [['co_name'], ['useclass1'], ['dwell_type'], ['tax_exempt'], ['polyptrel'], ['ownership']],
    codes: ['useclass1', 'dwell_type'],
    county: ['co_name'],
    spots: [[44.9250, -93.3190, 'Minneapolis Linden Hills'], [44.9800, -93.2700, 'Minneapolis downtown condos'], [44.9390, -93.1450, 'St Paul Summit Hill'],
      [44.9480, -93.0900, 'St Paul downtown'], [44.0220, -92.4630, 'Rochester'], [46.7900, -92.1000, 'Duluth'], [44.8897, -93.3499, 'Edina'],
      [45.5600, -94.1600, 'St Cloud'], [47.2400, -93.5300, 'Grand Rapids (rural north)']],
  },
  MD: {
    layer: 'https://geodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer/0',
    want: ['OBJECTID', 'JURSCODE', 'ACCTID', 'OOI', 'RESITYP', 'ADDRESS', 'STRTNUM', 'STRTDIR', 'STRTNAM', 'STRTTYP', 'STRTSFX', 'STRTUNT', 'ADDRTYP', 'CITY', 'ZIPCODE',
      'PREMSNUM', 'PREMSDIR', 'PREMSNAM', 'PREMSTYP', 'PREMCITY', 'PREMZIP', 'TOWNCODE', 'DESCTOWN', 'ZONING', 'CIUSE', 'DESCCIUSE', 'EXCLASS', 'DESCEXCL', 'LU',
      'DESCLU', 'ACRES', 'LANDAREA', 'LUOM', 'PFLW', 'YEARBLT', 'SQFTSTRC', 'STRUGRAD', 'DESCGRAD', 'STRUCNST', 'DESCCNST', 'STRUSTYL', 'DESCSTYL', 'STRUBLDG',
      'DESCBLDG', 'LASTASSD', 'CONVEY1', 'TRADATE', 'CONSIDR1', 'NFMLNDVL', 'NFMIMPVL', 'NFMTTLVL', 'HOMQLCOD', 'BLDG_STORY', 'BLDG_UNITS', 'RESIDENT', 'APRTMENT',
      'TRAILER', 'SPECIAL', 'OTHER', 'PTYPE', 'SDATWEBADR', 'MDPVDATE', 'SDATDATE', 'POLYDATE', 'POLYID'],
    group: [['JURSCODE'], ['LU', 'DESCLU'], ['DESCBLDG'], ['CONVEY1'], ['PTYPE']],
    codes: ['LU', 'DESCBLDG', 'DESCSTYL'],
    county: ['JURSCODE'],
    spots: [[38.9950, -77.0300, 'Silver Spring'], [39.2780, -76.6100, 'Baltimore Federal Hill'], [39.2840, -76.6060, 'Baltimore Inner Harbor condos'],
      [38.9784, -76.4922, 'Annapolis'], [38.3600, -75.0800, 'Ocean City condos'], [39.4143, -77.4105, 'Frederick'], [38.9847, -77.0947, 'Bethesda'],
      [39.6418, -77.7200, 'Hagerstown'], [39.5000, -79.3000, 'Garrett County (rural)']],
  },
  NY: {
    layer: 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcels_Public/MapServer/1',
    want: ['OBJECTID', 'COUNTY_NAME', 'MUNI_NAME', 'SWIS', 'PARCEL_ADDR', 'PRINT_KEY', 'SBL', 'CITYTOWN_NAME', 'CITYTOWN_SWIS', 'LOC_ST_NBR', 'LOC_STREET', 'LOC_UNIT',
      'LOC_ZIP', 'PROP_CLASS', 'ROLL_SECTION', 'LAND_AV', 'TOTAL_AV', 'FULL_MARKET_VAL', 'YR_BLT', 'FRONT', 'DEPTH', 'SQ_FT', 'ACRES', 'SCHOOL_CODE', 'SCHOOL_NAME',
      'SEWER_DESC', 'WATER_DESC', 'UTILITIES_DESC', 'BLDG_STYLE', 'BLDG_STYLE_DESC', 'HEAT_TYPE_DESC', 'FUEL_TYPE_DESC', 'SQFT_LIVING', 'GFA', 'NBR_KITCHENS',
      'NBR_FULL_BATHS', 'NBR_BEDROOMS', 'USED_AS_CODE', 'USED_AS_DESC', 'AG_DIST_NAME', 'MUNI_PARCEL_ID', 'SWIS_SBL_ID', 'ROLL_YR', 'SPATIAL_YR', 'OWNER_TYPE',
      'DUP_GEO', 'CALC_ACRES'],
    group: [['COUNTY_NAME'], ['PROP_CLASS'], ['ROLL_SECTION'], ['OWNER_TYPE'], ['ROLL_YR'], ['DUP_GEO']],
    codes: ['PROP_CLASS', 'ROLL_SECTION'],
    county: ['COUNTY_NAME'],
    spots: [[42.6526, -73.7562, 'Albany'], [41.0051, -73.7846, 'Scarsdale'], [43.1566, -77.6088, 'Rochester'], [43.0831, -73.7846, 'Saratoga Springs'],
      [42.8864, -78.8784, 'Buffalo'], [42.4440, -76.5019, 'Ithaca'], [44.2795, -73.9799, 'Lake Placid'], [40.7600, -73.5000, 'Long Island (Nassau)'],
      [41.0300, -73.7600, 'White Plains condos'], [43.0481, -76.1474, 'Syracuse']],
  },
  DC: {
    layer: 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/MapServer/40',
    want: ['OBJECTID', 'MAR_ID', 'SQUARE', 'SUFFIX', 'LOT', 'LOT_TYPE', 'UNDERLIES_CONDO', 'EFFECTIVETAXYEAR', 'QUADRANT', 'COL', 'SSL', 'PROPTYPE', 'TRIGROUP',
      'USECODE', 'LANDAREA', 'PRMSWARD', 'PREMISEADD', 'NBHDNAME', 'UNITNUMBER', 'NEWLAND', 'NEWIMPR', 'NEWTOTAL', 'PHASELAND', 'PHASEBUILD', 'VACLNDUSE',
      'LOWNUMBER', 'STREETNAME', 'QDRNTNAME', 'HSTDCODE', 'CLASSTYPE', 'TAXRATE', 'MIXEDUSE', 'SALEPRICE', 'SALEDATE', 'SALETYPE', 'ASSESSMENT', 'ANNUALTAX',
      'EXTRACTDAT', 'CY1TAX', 'CY2TAX', 'CONDOLOT', 'CONDO_REGIME_NUM', 'CALCULATEDAREA'],
    group: [['PROPTYPE'], ['USECODE'], ['CLASSTYPE'], ['SALETYPE']],
    codes: ['PROPTYPE', 'USECODE'],
    county: ['QUADRANT'],
    spots: [[38.8870, -76.9960, 'Capitol Hill'], [38.9076, -77.0623, 'Georgetown'], [38.9096, -77.0298, 'Logan Circle condos'], [38.9650, -77.0750, 'Chevy Chase DC'],
      [38.8650, -76.9850, 'Anacostia'], [38.9000, -77.0400, 'Downtown offices']],
  },
};

const BAD = /own|mail|madd|^m(unit|city|state|zip|addr|stname)|legdec|legal|careof|grantee|grantor|grntnam|namekey|mortg|po_box|tax_name|tax_add|^address\d|citystzip|asrname|nys_name|buyer|seller|taxpayer/i;

for (const [st, cfg] of Object.entries(STATES)) {
  const out = await page.evaluate(async (cfg, BADsrc) => {
    const BAD = new RegExp(BADsrc, 'i');
    const get = async (u, ms = 30000, body) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); const t0 = performance.now();
      try { const r = await fetch(u, body ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: c.signal } : { signal: c.signal });
        const j = await r.json(); return { j, ms: Math.round(performance.now() - t0) }; }
      catch (e) { return { err: String(e && e.message || e), ms: Math.round(performance.now() - t0) }; } finally { clearTimeout(t); } };
    const res = {};
    const m = await get(cfg.layer + '?f=json');
    if (!m.j || m.j.error) return { metaErr: m.err || JSON.stringify(m.j.error) };
    const fields = (m.j.fields || []);
    const oidF = m.j.objectIdField || (fields.find((f) => f.type === 'esriFieldTypeOID') || {}).name || 'objectid';
    res.fields = fields.map((f) => `${f.name}:${f.type.replace('esriFieldType', '')}${f.alias && f.alias !== f.name ? `(${f.alias})` : ''}`);
    res.max = m.j.maxRecordCount; res.sr = m.j.extent && m.j.extent.spatialReference; res.adv = m.j.advancedQueryCapabilities;
    const have = new Set(fields.map((f) => f.name)), want = cfg.want.filter((f) => have.has(f) && !BAD.test(f));
    res.asked = want.join(',');
    const countyF = cfg.county.find((f) => have.has(f));
    // statewide: records per county, and the property-type groups
    const stat = async (where, groupBy, ms) => {
      const q = new URLSearchParams({ where, f: 'json', returnGeometry: 'false', groupByFieldsForStatistics: groupBy.join(','), orderByFields: 'n DESC',
        outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: oidF, outStatisticFieldName: 'n' }]) });
      const r = await get(cfg.layer + '/query', ms, q.toString());
      if (!r.j || r.j.error) return { err: r.err || JSON.stringify(r.j.error).slice(0, 200), ms: r.ms };
      return { ms: r.ms, rows: (r.j.features || []).map((f) => Object.values(f.attributes).join(' | ')) };
    };
    if (countyF) res.byCounty = await stat('1=1', [countyF], 90000);
    res.groups = {};
    for (const g of cfg.group) if (g.every((f) => have.has(f))) res.groups[g.join('+')] = await stat('1=1', g, 90000);
    res.spots = [];
    for (const [lat, lon, name] of cfg.spots) {
      const spot = { name };
      const base = { geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', units: 'esriSRUnit_Meter', f: 'json' };
      const near = await get(cfg.layer + '/query', 30000, new URLSearchParams({ ...base, distance: '90', outFields: want.join(','), returnGeometry: 'true', outSR: '4326', resultRecordCount: '40' }).toString());
      if (!near.j || near.j.error) { spot.err = near.err || JSON.stringify(near.j.error).slice(0, 200); res.spots.push(spot); continue; }
      spot.ms = near.ms;
      const feats = near.j.features || [];
      const area = (g) => { if (!g || !g.rings) return null; let a = 0; for (const ring of g.rings) { for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]); }
        const k = 111320 * Math.cos(lat * Math.PI / 180) * 110540; return Math.round(Math.abs(a / 2) * k); };
      const ctr = (g) => { if (!g || !g.rings) return ''; const r0 = g.rings[0]; let x = 0, y = 0; for (const p of r0) { x += p[0]; y += p[1]; } return `${(y / r0.length).toFixed(5)},${(x / r0.length).toFixed(5)}`; };
      spot.recs = feats.map((f) => ({ c: ctr(f.geometry), m2: area(f.geometry), ...Object.fromEntries(Object.entries(f.attributes).filter(([k, v]) => !BAD.test(k) && v !== null && v !== '' && v !== ' ')) }))
        .sort((p, q) => (p.c < q.c ? -1 : p.c > q.c ? 1 : 0));
      spot.n = feats.length;
      res.spots.push(spot);
      // codes used within ~1.5 km
      const env = { geometry: `${lon - 0.018},${lat - 0.0135},${lon + 0.018},${lat + 0.0135}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', f: 'json', returnGeometry: 'false',
        groupByFieldsForStatistics: cfg.codes.filter((f) => have.has(f)).join(','), orderByFields: 'n DESC',
        outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: oidF, outStatisticFieldName: 'n' }]) };
      const codes = await get(cfg.layer + '/query', 30000, new URLSearchParams(env).toString());
      spot.codes = codes.j && !codes.j.error ? (codes.j.features || []).slice(0, 40).map((f) => Object.values(f.attributes).join(' | ')) : (codes.err || JSON.stringify(codes.j && codes.j.error).slice(0, 200));
    }
    return res;
  }, cfg, BAD.source);
  log(`==== ${st}  ${cfg.layer}`);
  if (out.metaErr) { log('meta error', out.metaErr); continue; }
  log(`max ${out.max}  sr ${JSON.stringify(out.sr)}`);
  log('fields:', out.fields.join('  '));
  log('asked:', out.asked);
  log('by county:', JSON.stringify(out.byCounty).slice(0, 4000));
  for (const [k, v] of Object.entries(out.groups)) log(`group ${k}:`, JSON.stringify(v).slice(0, 6000));
  for (const s of out.spots) {
    log(`-- ${s.name}: ${s.err || `${s.n} records in ${s.ms} ms`}`);
    for (const r of s.recs || []) log('   ', JSON.stringify(r).slice(0, 700));
    log('   codes within ~1.5 km:', JSON.stringify(s.codes).slice(0, 2500));
  }
}
await browser.close(); srv.close();
