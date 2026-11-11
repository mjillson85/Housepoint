// Lists the layers and tables of the services behind the Tier 2 states, with each one's field names, to find tables (buildings,
// dwellings, sales) that could be joined to the lots by parcel number, as DC's are. Plain Node; prints names only.
const ROOTS = ['https://gis.maricopa.gov/arcgis/rest/services/IndividualService/Parcel/MapServer',
  'https://services2.arcgis.com/McQ0OlIABe29rJJy/arcgis/rest/services/Taxlots_with_Right_of_Way_Public/FeatureServer',
  'https://services6.arcgis.com/K0qS4r8AEJxrE8em/arcgis/rest/services/Macomb_County_Parcel_Data/FeatureServer',
  'https://services.arcgis.com/tNJpAOha4mODLkXz/arcgis/rest/services/Cadastral_2020/FeatureServer',
  'https://services2.arcgis.com/w657bnjzrjguNyOy/arcgis/rest/services/Pardata_JurisFeb2024/FeatureServer',
  'https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Parcels_Organized_Towns/FeatureServer',
  'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/parcel_file_current/FeatureServer',
  'https://services1.arcgis.com/AQDHTHDrZzfsFsB5/arcgis/rest/services/Tax_Parcels/FeatureServer',
  'https://services2.arcgis.com/dgGjZc6xAH5m5JyP/arcgis/rest/services/Parcels/FeatureServer'];
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
const SKIP = /own|mail|name|legal|careof|grant|deed|buyer|seller|taxpayer|addr_?line|signed|comment/i;
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
