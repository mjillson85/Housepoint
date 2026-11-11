# Prints North Carolina's county and municipal property tax rates from the NC Department of Revenue's spreadsheets, so the
# app's NC tax estimate can be built from the real table. Run by the "probe services" workflow (GitHub can reach ncdor.gov).
#   python3 probe/nc-tax-rates.py
import io, re, sys, urllib.request
from openpyxl import load_workbook

BASE = 'https://www.ncdor.gov'
PAGES = [
    '/taxes-forms/property-tax/property-tax-rates/county-property-tax-rates-and-reappraisal-schedules/fiscal-year-2026-2027',
    '/taxes-forms/property-tax/property-tax-rates/county-and-municipal-property-tax-rates-and-year-most-recent-reappraisal',
    '/taxes-forms/property-tax/property-tax-rates/county-and-municipal-effective-tax-rates',
]

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Housepoint probe)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def links(path):
    html = get(BASE + path).decode('utf-8', 'replace')
    return sorted(set(re.findall(r'href="([^"]+)"', html)))

seen = set()
def dump(url):
    if url in seen: return
    seen.add(url)
    print(f'==== {url}')
    try:
        wb = load_workbook(io.BytesIO(get(url)), read_only=True, data_only=True)
    except Exception as e:
        print('  could not read:', e); return
    for ws in wb.worksheets:
        print(f'--- sheet {ws.title}')
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i > 1200: break
            vals = ['' if v is None else str(v).strip() for v in row]
            if any(vals): print('|'.join(vals).rstrip('|'))

for p in PAGES:
    try: ls = links(p)
    except Exception as e: print('page failed', p, e); continue
    print(f'## {p}')
    # the year pages, then their spreadsheets
    years = [l for l in ls if re.search(r'2026-2027|fiscal-year-2026', l)]
    for l in years: print('  year link', l)
    for l in ls:
        if re.search(r'xlsx', l, re.I): dump(l if l.startswith('http') else BASE + l)
    for y in years:
        try: yl = links(y if y.startswith('/') else re.sub(r'^https?://[^/]+', '', y))
        except Exception as e: print('year page failed', y, e); continue
        for l in yl:
            if re.search(r'xlsx', l, re.I): dump(l if l.startswith('http') else BASE + l)
sys.stdout.flush()
