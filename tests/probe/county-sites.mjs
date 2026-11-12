// Finds which counties' record sites follow a state's common pattern, so the basic card can link a building straight to its county's
// records: Georgia's counties on qPublic, Iowa's on iowaassessors.com, plus Tennessee's and Kansas's statewide sites. Opens each
// candidate once and keeps only those that answer and name their county. Plain Node; prints only (the pages show owners' names, and
// nothing but their title and whether the county's name appears is read).
//   cd tests && node probe/county-sites.mjs
const GA = ["Appling", "Atkinson", "Bacon", "Baker", "Baldwin", "Banks", "Barrow", "Bartow", "Ben Hill", "Berrien", "Bibb", "Bleckley", "Brantley", "Brooks", "Bryan", "Bulloch", "Burke", "Butts", "Calhoun", "Camden", "Candler", "Carroll", "Catoosa", "Charlton", "Chatham", "Chattahoochee", "Chattooga", "Cherokee", "Clarke", "Clay", "Clayton", "Clinch", "Cobb", "Coffee", "Colquitt", "Columbia", "Cook", "Coweta", "Crawford", "Crisp", "Dade", "Dawson", "DeKalb", "Decatur", "Dodge", "Dooly", "Dougherty", "Douglas", "Early", "Echols", "Effingham", "Elbert", "Emanuel", "Evans", "Fannin", "Fayette", "Floyd", "Forsyth", "Franklin", "Fulton", "Gilmer", "Glascock", "Glynn", "Gordon", "Grady", "Greene", "Gwinnett", "Habersham", "Hall", "Hancock", "Haralson", "Harris", "Hart", "Heard", "Henry", "Houston", "Irwin", "Jackson", "Jasper", "Jeff Davis", "Jefferson", "Jenkins", "Johnson", "Jones", "Lamar", "Lanier", "Laurens", "Lee", "Liberty", "Lincoln", "Long", "Lowndes", "Lumpkin", "Macon", "Madison", "Marion", "McDuffie", "McIntosh", "Meriwether", "Miller", "Mitchell", "Monroe", "Montgomery", "Morgan", "Murray", "Muscogee", "Newton", "Oconee", "Oglethorpe", "Paulding", "Peach", "Pickens", "Pierce", "Pike", "Polk", "Pulaski", "Putnam", "Quitman", "Rabun", "Randolph", "Richmond", "Rockdale", "Schley", "Screven", "Seminole", "Spalding", "Stephens", "Stewart", "Sumter", "Talbot", "Taliaferro", "Tattnall", "Taylor", "Telfair", "Terrell", "Thomas", "Tift", "Toombs", "Towns", "Treutlen", "Troup", "Turner", "Twiggs", "Union", "Upson", "Walker", "Walton", "Ware", "Warren", "Washington", "Wayne", "Webster", "Wheeler", "White", "Whitfield", "Wilcox", "Wilkes", "Wilkinson", "Worth"];
const IA = ["Adair", "Adams", "Allamakee", "Appanoose", "Audubon", "Benton", "Black Hawk", "Boone", "Bremer", "Buchanan", "Buena Vista", "Butler", "Calhoun", "Carroll", "Cass", "Cedar", "Cerro Gordo", "Cherokee", "Chickasaw", "Clarke", "Clay", "Clayton", "Clinton", "Crawford", "Dallas", "Davis", "Decatur", "Delaware", "Des Moines", "Dickinson", "Dubuque", "Emmet", "Fayette", "Floyd", "Franklin", "Fremont", "Greene", "Grundy", "Guthrie", "Hamilton", "Hancock", "Hardin", "Harrison", "Henry", "Howard", "Humboldt", "Ida", "Iowa", "Jackson", "Jasper", "Jefferson", "Johnson", "Jones", "Keokuk", "Kossuth", "Lee", "Linn", "Louisa", "Lucas", "Lyon", "Madison", "Mahaska", "Marion", "Marshall", "Mills", "Mitchell", "Monona", "Monroe", "Montgomery", "Muscatine", "O'Brien", "Osceola", "Page", "Palo Alto", "Plymouth", "Pocahontas", "Polk", "Pottawattamie", "Poweshiek", "Ringgold", "Sac", "Scott", "Shelby", "Sioux", "Story", "Tama", "Taylor", "Union", "Van Buren", "Wapello", "Warren", "Washington", "Wayne", "Webster", "Winnebago", "Winneshiek", "Woodbury", "Worth", "Wright"];
const get = async (url) => {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 20000);
  try { const r = await fetch(url, { redirect: 'follow', signal: c.signal, headers: { 'user-agent': 'Mozilla/5.0 (Housepoint link check)' } });
    return { status: r.status, url: r.url, body: (await r.text()).slice(0, 300000) }; }
  catch (e) { return { status: 0, err: e.name === 'AbortError' ? 'no answer in 20 s' : e.message }; }
  finally { clearTimeout(t); }
};
const title = (b) => ((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(b || '') || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 90);
const print = (tag, obj) => { const t = JSON.stringify(obj); for (let k = 0; k * 2500 < t.length; k++) console.log(`${tag} ${k} ${t.slice(k * 2500, (k + 1) * 2500)}`); };
async function check(state, names, make) {
  const ok = {}, miss = [], blocked = [];
  for (const n of names) {
    const url = make(n), r = await get(url);
    const named = r.body && new RegExp(n.replace(/[^A-Za-z]+/g, '.?'), 'i').test(r.body);
    if (r.status === 200 && named) ok[n] = r.url || url; else if (r.status === 403) blocked.push(n); else miss.push(`${n} (${r.status || r.err})`);
  }
  console.log(`== ${state}: ${Object.keys(ok).length} of ${names.length} answer and name their county; ${blocked.length} turned away robots; missing: ${miss.join(', ') || 'none'}`);
  if (blocked.length) console.log(`   robots turned away: ${blocked.join(', ')}`);
  print(`SITES ${state}`, ok);
}
// Statewide sites
for (const [name, url] of [['Tennessee (Comptroller, 86 counties)', 'https://assessment.cot.tn.gov/TPAD'], ['Kansas ORKA', 'https://www.kansasgis.org/orka/'], ['Kansas ORKA hub', 'https://orkahub.kansasgis.org/'],
  ['qPublic Georgia list', 'https://qpublic.net/ga/'], ['qPublic home', 'https://qpublic.net/'], ['Iowa assessors home', 'https://www.iowaassessors.com/']]) {
  const r = await get(url);
  console.log(`== ${name}: ${r.status || r.err}${r.url && r.url !== url ? ` → ${r.url}` : ''} · "${title(r.body)}"`);
  // the lists of counties these pages link to, for building the tables
  if (r.body && /qpublic|iowaassessors/i.test(url)) {
    const links = [...new Set([...r.body.matchAll(/href=["']([^"']+)["'][^>]*>([^<]{2,40})</gi)].map((m) => `${m[2].trim()}=${m[1]}`).filter((x) => /county|App=|iowaassessors|schneidercorp/i.test(x)))];
    print(`LINKS ${name}`, links.slice(0, 300));
  }
}
await check('GA', GA, (n) => `https://qpublic.schneidercorp.com/Application.aspx?App=${n.replace(/[^A-Za-z]/g, '')}CountyGA&Layer=Parcels&PageType=Search`);
await check('IA', IA, (n) => `https://${n.toLowerCase().replace(/[^a-z]/g, '')}.iowaassessors.com/`);
