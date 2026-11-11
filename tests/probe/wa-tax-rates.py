# Prints Washington's average property tax levy rates by county from the WA Department of Revenue's Property Tax Statistics
# spreadsheets, so the app's WA tax estimate can be built from the real table. Run by the "probe services" workflow.
#   python3 probe/wa-tax-rates.py
import io, re, sys, urllib.request
from openpyxl import load_workbook

BASE = 'https://dor.wa.gov'
PAGES = ['/about/statistics-reports/property-tax-statistics/property-tax-statistics-2026',
         '/about/statistics-reports/property-tax-statistics/property-tax-statistics-2025']

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Housepoint probe)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

for p in PAGES:
    try: html = get(BASE + p).decode('utf-8', 'replace')
    except Exception as e: print('page failed', p, e); continue
    print(f'## {p}')
    links = re.findall(r'href="([^"]+)"[^>]*>([^<]*)<', html)
    for href, text in links:
        if re.search(r'xlsx?$|\.pdf$', href, re.I): print('  link', text.strip()[:80], '->', href)
    for href, text in links:
        if not re.search(r'xlsx?$', href, re.I): continue
        if not re.search(r'average|valuations|levy rate|rates', text + href, re.I): continue
        url = href if href.startswith('http') else BASE + href
        print(f'==== {text.strip()} {url}')
        try: wb = load_workbook(io.BytesIO(get(url)), read_only=True, data_only=True)
        except Exception as e: print('  could not read:', e); continue
        for ws in wb.worksheets:
            print(f'--- sheet {ws.title}')
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i > 120: break
                vals = ['' if v is None else str(v).strip() for v in row]
                if any(vals): print('|'.join(vals).rstrip('|'))
sys.stdout.flush()
