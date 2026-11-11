// Utah's parcels with values come one county at a time (UGRC's "LIR" parcel services). Lists them, with each one's record
// count and field names, so Utah can be wired county by county. Plain Node; prints only. Run by the probe workflow.
const DIR = 'https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services';
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const d = await get(`${DIR}?f=json`);
const lir = (d.services || []).filter((s) => /LIR|Parcel/i.test(s.name)).map((s) => s.name).sort();
console.log(`${lir.length} parcel services:`, lir.join(' '));
const firstFields = {};
for (const name of lir.filter((n) => /_LIR$/i.test(n))) {
  try {
    const m = await get(`${DIR}/${name}/FeatureServer/0?f=json`);
    const c = await get(`${DIR}/${name}/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json`);
    const f = (m.fields || []).map((x) => x.name).join(',');
    if (!firstFields[f]) { firstFields[f] = name; console.log(`${name}: ${c.count} records, max ${m.maxRecordCount}, fields ${f}`); }
    else console.log(`${name}: ${c.count} records, same fields as ${firstFields[f]}; extent ${JSON.stringify(m.extent && [m.extent.xmin, m.extent.ymin, m.extent.xmax, m.extent.ymax].map((v) => Math.round(v)))} sr ${m.extent && m.extent.spatialReference && m.extent.spatialReference.latestWkid}`);
  } catch (e) { console.log(name, 'failed', e.message); }
}
