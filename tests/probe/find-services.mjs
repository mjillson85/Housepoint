// Lists parcel services in a few ArcGIS servers and ArcGIS Online searches, to find statewide and county layers with values.
// Plain Node; prints service names and URLs only.
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
const ROOTS = ['https://gis.nd.gov/arcgis/rest/services', 'https://gis.ohio.gov/arcgis/rest/services', 'https://gisdata.in.gov/server/rest/services'];
for (const root of ROOTS) {
  try {
    const d = await get(`${root}?f=json`);
    const names = [...(d.services || []).map((s) => `${s.name} (${s.type})`), ...(d.folders || []).map((f) => `[${f}]`)];
    console.log(`== ${root}: ${names.filter((n) => /parcel|cadast|tax|assess|\[/i.test(n)).join(' | ').slice(0, 1500)}`);
  } catch (e) { console.log(`== ${root}: failed ${e.message}`); }
}
// ArcGIS Online: county parcel layers with values for the biggest counties without statewide values
const Q = ['Los Angeles County parcels assessor', 'Maricopa County parcels', 'Philadelphia properties assessments', 'Harris County parcels HCAD', 'San Diego County parcels',
  'Orange County California parcels', 'Dallas County parcels DCAD', 'Riverside County parcels', 'Clark County Nevada parcels assessor', 'Bexar County parcels BCAD',
  'Santa Clara County parcels', 'Tarrant County parcels TAD', 'San Bernardino County parcels', 'Wayne County Michigan parcels', 'Alameda County parcels', 'Sacramento County parcels',
  'Travis County parcels TCAD', 'Cuyahoga County parcels', 'Fulton County Georgia tax parcels', 'Allegheny County parcels assessment', 'Franklin County Ohio parcels auditor',
  'Oakland County Michigan parcels', 'Fairfax County parcels', 'Shelby County Tennessee parcels', 'Nashville Davidson parcels', 'Louisville Jefferson County parcels PVA',
  'Multnomah County taxlots', 'Oklahoma County parcels assessor', 'Bernalillo County parcels', 'Pima County parcels', 'Jackson County Missouri parcels', 'St. Louis County Missouri parcels',
  'Hamilton County Ohio parcels auditor', 'Marion County Indiana parcels', 'Honolulu parcels', 'Gwinnett County parcels', 'Cobb County parcels', 'DeKalb County Georgia parcels',
  'Johnson County Kansas parcels', 'Sedgwick County parcels', 'Orleans Parish parcels assessor', 'East Baton Rouge parcels', 'Charleston County parcels', 'Greenville County parcels',
  'Minnehaha County parcels', 'Hinds County parcels', 'Tulsa County parcels', 'Ada County parcels', 'Kent County Michigan parcels', 'Macomb County parcels', 'Providence parcels',
  'Richland County South Carolina parcels', 'Knox County Tennessee parcels', 'Hamilton County Tennessee parcels', 'Washington County Oregon taxlots', 'Lane County taxlots'];
for (const q of Q) {
  try {
    const p = new URLSearchParams({ f: 'json', q: `${q} type:"Feature Service" OR type:"Map Service"`, num: '6', sortField: 'numviews', sortOrder: 'desc' });
    const d = await get(`https://www.arcgis.com/sharing/rest/search?${p}`);
    console.log(`## ${q}: ` + (d.results || []).map((r) => `${r.title} [${r.owner}] ${r.url || ''}`).join(' || ').slice(0, 1200));
  } catch (e) { console.log(`## ${q}: failed ${e.message}`); }
}
