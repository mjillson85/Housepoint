// Lists the layers and tables of the services behind the Tier 2 states, with each one's field names, to find tables (buildings,
// dwellings, sales) that could be joined to the lots by parcel number, as DC's are. Plain Node; prints names only.
const ROOTS = ['https://gisservice.mt.gov/ArcGIS/rest/services/msdi_cadastral_map_v1/MapServer',
  'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/FeatureServer',
  'https://gis.cookcountyil.gov/traditional/rest/services/cookVwrDynmc/MapServer'];
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
const SKIP = /own|mail|name|legal|careof|grant|deed|buyer|seller|taxpayer/i;
for (const root of ROOTS) {
  console.log(`== ${root}`);
  try {
    const j = await get(`${root}?f=json`);
    const all = [...(j.layers || []).map((l) => ['layer', l]), ...(j.tables || []).map((t) => ['table', t])];
    console.log(`   ${all.length} layers and tables`);
    for (const [kind, l] of all) {
      let f = '';
      try { const m = await get(`${root}/${l.id}?f=json`); f = (m.fields || []).map((x) => (SKIP.test(x.name) ? `(${x.name})` : x.name)).join(','); } catch (e) { f = 'meta failed ' + e.message; }
      console.log(`   ${kind} ${l.id} ${l.name}: ${f.slice(0, 900)}`);
    }
  } catch (e) { console.log('   failed', e.message); }
}
