// One list of owner-like field names for every script that touches the parcel services: the tests, capture, add-lot and the
// probes. A service field matching OWNERISH is never asked for, saved or printed. KEEP_NAME lists the few names that match the
// pattern but hold no owner data: a town's name, an ownership category (Private, Exempt, State…), the property's own city, state
// and zip (Montana), and the last sale's date (Nashville's OwnDate, New Jersey's DEED_DATE).
export const OWNERISH = new RegExp([
  '(^|_)OWN', 'OWNER', 'MAIL', 'PSTL', 'PO_?BOX', 'ADDRESSEE', 'TAXPAYER', 'TAXPA', 'TXPYR',   // TAXPAADD1: Dallas's taxpayer address
  'TAX_NAME', 'TAX_ADD', 'CHANGENOTICE',   // Allegheny's "change notice" (mailing) addresses
  'ASRNAME', 'NYS_NAME', 'PRIMARY_OWNER', 'ADD_OWNER',
  '^NAME', '_NAME\\d', 'CARE_?OF', '^C_?O$', 'ATTN', '^ADDRESS[12]$', 'ADDR_?LINE', 'ADDR_?LN\\d', 'CITYSTZIP', 'MORTG',
  // deeds and legal descriptions: who sold to whom, and the book and page that name them
  'LEGAL', 'LGL', 'LEGDEC', 'LIBER', 'FOLIO', 'DEED', 'GRANTOR', 'GRANTEE', 'GRNTNAM', 'BUYER', 'SELLER', '(^|_)BOOK', '(^|_)PAGE(_|$)', 'INSTR',
  '(PROP|TAX|PARCEL|LEG)_?DESC(R|RIPTION)?$',
].join('|'), 'i');
export const KEEP_NAME = /^(MUN_NAME|Town_Name|Ownership_Type|ownership|CityStateZip|OwnDate|DEED_?DATE)$/i;
export const isOwnerish = (f) => OWNERISH.test(String(f)) && !KEEP_NAME.test(String(f));
