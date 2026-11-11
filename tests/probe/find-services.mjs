// Lists parcel services in a few ArcGIS servers and ArcGIS Online searches, to find statewide and county layers with values.
// Plain Node; prints service names and URLs only.
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
const ROOTS = [];
for (const root of ROOTS) {
  try {
    const d = await get(`${root}?f=json`);
    const names = [...(d.services || []).map((s) => `${s.name} (${s.type})`), ...(d.folders || []).map((f) => `[${f}]`)];
    console.log(`== ${root}: ${names.filter((n) => /parcel|cadast|tax|assess|\[/i.test(n)).join(' | ').slice(0, 1500)}`);
  } catch (e) { console.log(`== ${root}: failed ${e.message}`); }
}
// ArcGIS Online: county parcel layers with values for the biggest counties without statewide values
const Q = ['Los Angeles County Assessor parcels', 'LA County Parcels assessor roll', 'Philadelphia OPA properties', 'SanGIS parcels', 'Orange County OCPW parcels',
  'Riverside County RCIT parcels', 'Santa Clara County assessor parcels', 'Dallas Central Appraisal District parcels', 'Clark County Nevada assessor parcels', 'Detroit parcels current',
  'Fulton County tax parcels', 'Allegheny County parcels WPRDC', 'Oakland County parcels', 'Fairfax County tax parcels', 'Shelby County assessor parcels', 'Oklahoma County Assessor parcels',
  'Pima County parcels', 'Jackson County Missouri parcels assessor', 'Cobb County tax parcels', 'DeKalb County tax parcels', 'Johnson County Kansas AIMS parcels', 'Sedgwick County parcels',
  'Charleston County SC parcels', 'Greenville County SC parcels', 'Tulsa County parcels', 'Ada County Assessor parcels', 'Kent County Michigan parcels', 'Providence parcels',
  'Richland County SC parcels', 'Knox County KGIS parcels', 'Hamilton County Tennessee parcels', 'Hinds County Mississippi parcels', 'Wichita parcels', 'Kansas City parcels',
  'Cleveland parcels Cuyahoga', 'Pittsburgh parcels', 'Atlanta parcels', 'Clark County NV GIS parcels'];
for (const q of Q) {
  try {
    const p = new URLSearchParams({ f: 'json', q: `${q} type:"Feature Service" OR type:"Map Service"`, num: '6', sortField: 'numviews', sortOrder: 'desc' });
    const d = await get(`https://www.arcgis.com/sharing/rest/search?${p}`);
    console.log(`## ${q}: ` + (d.results || []).map((r) => `${r.title} [${r.owner}] ${r.url || ''}`).join(' || ').slice(0, 1200));
  } catch (e) { console.log(`## ${q}: failed ${e.message}`); }
}
