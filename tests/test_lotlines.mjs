// The big counties (Harris, Tarrant, Alameda, San Bernardino, Franklin, Hamilton, Nashville, Bismarck, the Portland area, Ada,
// Oakland, Macomb, Wichita, Atlanta, Maricopa; then Los Angeles, Philadelphia, Allegheny, Travis and Bexar), Maine, and the lot-line states (Indiana, New Hampshire, West Virginia, Nevada,
// Hawaii, Delaware, Virginia). Outlines and state lines, compass, property types, each layer faked with its real field names (owner,
// mailing and legal fields included, so the test sees they're never asked for) and the card at a lot in each.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8786);
const ORIGIN = 'http://localhost:8786';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const LOT = [15, -12, 40, 12];

// Each layer: its real fields (owner ones in `owner`), a spot (the app's health-check spot), a lot there, and what its card shows
const R = {
  TX_HARRIS: { url: 'https://www.gis.hctx.net/arcgishcpid/rest/services/HCAD/Parcels/MapServer/0', spot: [29.7400, -95.3900],
    fields: ['OBJECTID', 'LOWPARCELID', 'HCAD_NUM', 'acct_num', 'tax_year', 'site_str_num', 'site_str_name', 'site_city', 'site_zip', 'state_class', 'land_value', 'bld_value',
      'impr_value', 'total_appraised_val', 'total_market_val', 'land_use', 'Situs_Address'],
    owner: { owner_name_1: 'SECRET OWNER', mail_addr_1: 'SECRET MAILING', legal_dscr_1: 'SECRET LEGAL' },
    lot: { acct_num: '0261450000006', HCAD_NUM: '0261450000006', tax_year: '2026', Situs_Address: '816    MARSHALL ST, HOUSTON, TX 77006', site_city: 'HOUSTON', site_zip: '77006',
      state_class: 'A1', land_use: '1001', land_value: 440000, impr_value: 352840, total_market_val: 792840, total_appraised_val: 792840 },
    card: [/816 Marshall St \|/, /Houston · Single-family home/, /MARKET VALUE \(HCAD\) · 2026 TAX YEAR \| \$792,840/i, /Texas doesn’t make sale prices public/] },
  TX_TARRANT: { url: 'https://mapit.tarrantcounty.com/arcgis/rest/services/Dynamic/TADParcels/MapServer/0', spot: [32.7100, -97.3600],
    fields: ['OBJECTID', 'TAXPIN', 'ACCOUNT', 'SITUS_ADDR', 'CITY', 'ZIPCODE', 'BEDROOMS', 'BATHROOMS', 'YEAR_BUILT', 'LIVING_ARE', 'APPRAISAL_', 'APPRAISEDV', 'LAND_VALUE',
      'IMPR_VALUE', 'TOTAL_VALU', 'PARCELTYPE'],
    owner: { OWNER_NAME: 'SECRET OWNER', OWNER_ADDR: 'SECRET MAILING', LEGAL_1: 'SECRET LEGAL', DEED_BOOK: 'SECRET DEED' },
    lot: { TAXPIN: '41227-2-9', ACCOUNT: '01234567', SITUS_ADDR: '2412 WILLING AVE               ', CITY: 'FORT WORTH                      ', ZIPCODE: '76110     ', BEDROOMS: 3,
      BATHROOMS: 2, YEAR_BUILT: 1925, LIVING_ARE: 1450, LAND_VALUE: 90000, IMPR_VALUE: 210000, TOTAL_VALU: 300000, APPRAISEDV: 280000, APPRAISAL_: 1767225600000 },
    card: [/2412 Willing Ave \|/, /Fort Worth · Residential/, /\$300,000/, /Built 1925/] },
  CA_ALAMEDA: { url: 'https://services5.arcgis.com/ROBnTHSNjoZ2Wm1P/arcgis/rest/services/Parcels/FeatureServer/0', spot: [37.8690, -122.2710],
    fields: ['OBJECTID', 'APN', 'SitusStreetNumber', 'SitusStreetName', 'SitusUnit', 'SitusCity', 'SitusZip', 'Land', 'Imps', 'TotalNetValue', 'UseCode', 'SitusAddress'],
    owner: { MailingAddressStreet: 'SECRET MAILING', MailingAddress: 'SECRET MAILING 2' },
    lot: { APN: '57-2021-12', SitusAddress: '2125 BONAR ST BERKELEY 94702', SitusCity: 'BERKELEY', SitusZip: '94702', Land: 300000, Imps: 450000, TotalNetValue: 743000, UseCode: '2502' },
    card: [/2125 Bonar St \|/, /Berkeley · Home with a backyard ADU/, /ASSESSED VALUE \| \$750,000/i, /Proposition 13/] },
  CA_SBD: { url: 'https://services.arcgis.com/aA3snZwJfFkVyDuP/arcgis/rest/services/Parcels_for_San_Bernardino_County/FeatureServer/0', spot: [34.0590, -117.1810],
    fields: ['OBJECTID', 'ParcelNumber', 'LandValue', 'ImprovementValue', 'Acreage', 'Jurisdiction', 'BaseYear', 'AssessDescription', 'AssessClass'],
    owner: { OwnerName: 'SECRET OWNER' },
    lot: { ParcelNumber: '016921227', LandValue: '96,529', ImprovementValue: '683,296', AssessClass: 'SINGLE FAMILY RESIDENTIAL', AssessDescription: 'SINGLE FAMILY RESIDENCE', Jurisdiction: 'City of Redlands' },
    card: [/26 Hillcrest Road \|/, /Redlands · Single-family home/, /\$779,825/, /nearest one on OpenStreetMap/] },
  OH_FRANKLIN: { url: 'https://gis.franklincountyohio.gov/hosting/rest/services/ParcelFeatures/Parcel_Features/MapServer/0', spot: [39.9890, -83.0100],
    fields: ['OBJECTID', 'PARCELID', 'CLASSCD', 'CLASSDSCRP', 'SITEADDRESS', 'ZIPCD', 'CVTTXDSCRP', 'SALEDATE', 'SALEPRICE', 'RESFLRAREA', 'RESYRBLT', 'BEDRMS', 'BATHS', 'HBATHS',
      'BLDGAREA', 'TOTVALUEBASE', 'LNDVALUEBASE', 'BLDVALUEBASE', 'TOTCNTTXOD'],
    owner: { OWNERNME1: 'SECRET OWNER', MAILNME1: 'SECRET MAILING NAME', PSTLADDRES: 'SECRET MAILING', CNVYNAME: 'SECRET CONVEYANCE', PRPRTYDSCRP: 'SECRET LEGAL' },
    lot: { PARCELID: '010-003116', CLASSCD: '520', CLASSDSCRP: 'TWO FAMILY DWELLING, PLATTED LOT', SITEADDRESS: '1325 HUNTER AVE', ZIPCD: '43201', CVTTXDSCRP: 'CITY OF COLUMBUS',
      SALEDATE: 1571720400000, SALEPRICE: 350000, RESFLRAREA: 2408, RESYRBLT: 1880, BEDRMS: 3, BATHS: 2, HBATHS: 0, TOTVALUEBASE: 533800, LNDVALUEBASE: 175500, BLDVALUEBASE: 358300 },
    card: [/1325 Hunter Ave \|/, /Columbus · Two-family home/, /\$533,800/, /Last sold \$350,000 · Oct 2019/, /Built 1880/] },
  OH_HAMILTON: { url: 'https://cagisonline.hamilton-co.org/arcgis/rest/services/COUNTYWIDE/Cadastral/MapServer/0', spot: [39.1400, -84.4400],
    fields: ['OBJECTID', 'UNIT', 'PARCELID', 'CLASS', 'ADDRNO', 'ADDRST', 'ADDRSF', 'SALDAT', 'SALAMT', 'MKT_TOTAL_VAL', 'MKTLND', 'MKTIMP', 'ANNUAL_TAXES', 'NUM_UNITS', 'UNIT_1', 'NUMPCL'],
    owner: { OWNNM1: 'SECRET OWNER', OWNAD1: 'SECRET MAILING', MLNM1: 'SECRET MAILING NAME', LGLDS1: 'SECRET LEGAL', PREVOWN1: 'SECRET PREVIOUS', DELQ_TAXES: 999999 },
    lot: { PARCELID: '00460A040168', ADDRNO: '3540', ADDRST: 'MICHIGAN', ADDRSF: 'AVE', CLASS: 510, SALDAT: 1560000000000, SALAMT: 410000, MKT_TOTAL_VAL: 512000, MKTLND: 120000,
      MKTIMP: 392000, ANNUAL_TAXES: 9123.45, NUMPCL: 2 },
    card: [/3540 Michigan Ave \|/, /Single-family home/, /\$512,000/, /\$9,123/, /Last sold \$410,000 \(part of a multi-lot sale\) · Jun 2019/] },
  TN_DAVIDSON: { url: 'https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Parcels_view/FeatureServer/0', spot: [36.1300, -86.8000],
    fields: ['OBJECTID', 'STANPAR', 'FEATURETYPE', 'OwnDate', 'SalePrice', 'PropAddr', 'PropCity', 'PropZip', 'LUCode', 'LUDesc', 'LandAppr', 'ImprAppr', 'TotlAppr'],
    owner: { Owner: 'SECRET OWNER', OwnAddr1: 'SECRET MAILING', LegalDesc: 'SECRET LEGAL', OwnInstr: 'SECRET DEED' },
    lot: { STANPAR: '11706006400', FEATURETYPE: 'Lot', OwnDate: 1560000000000, SalePrice: 905000, PropAddr: '1916 ASHWOOD AVE', PropCity: 'NASHVILLE', PropZip: '37212',
      LUCode: '011', LUDesc: 'SINGLE FAMILY', LandAppr: 455000, ImprAppr: 628000, TotlAppr: 1083000 },
    card: [/1916 Ashwood Ave \|/, /Nashville · Single-family home/, /\$1,083,000/, /Last sold \$905,000 · Jun 2019/] },
  ND_BISMARCK: { url: 'https://services1.arcgis.com/XxHmL09eFqJWI0gE/arcgis/rest/services/ParcelsPublic/FeatureServer/0', spot: [46.8190, -100.7700],
    fields: ['OBJECTID', 'PARCEL_ID', 'LANDUSE', 'Housing_Unit_Counts', 'UNITS', 'MARKET_LAND', 'MARKET_BUILDING', 'SALE_PRICE', 'SALE_DATE', 'ADDRESS', 'YEAR_BUILT', 'TOTALBATHS',
      'TOTALBEDSABOVE', 'TOTALBEDSBELOW', 'PROPERTY_TYPE_DESC', 'CITY_STATE', 'ZIP'],
    owner: { PROPERTY_OWNER: 'SECRET OWNER', MAILING_ADDRESS1: 'SECRET MAILING', LEGAL_ONE: 'SECRET LEGAL' },
    lot: { PARCEL_ID: '0100-027-030', LANDUSE: 'RESIDENTIAL TWO FAMILY', UNITS: 2, MARKET_LAND: 55000, MARKET_BUILDING: 213100, SALE_PRICE: 186000, SALE_DATE: '2019/06/28',
      ADDRESS: '1015 N 4TH ST', YEAR_BUILT: 1950, TOTALBEDSABOVE: 3, TOTALBEDSBELOW: 1, TOTALBATHS: 2, CITY_STATE: 'SECRET MAILING TOWN' },
    card: [/1015 N 4th St \|/, /Bismarck · Two-family home/, /\$268,100/, /Last sold \$186,000 · Jun 2019/] },
  OR_METRO: { url: 'https://services2.arcgis.com/McQ0OlIABe29rJJy/arcgis/rest/services/Taxlots_with_Right_of_Way_Public/FeatureServer/3', spot: [45.5120, -122.6400],
    fields: ['FID', 'TLID', 'SITEADDR', 'SITECITY', 'SITEZIP', 'BLDGSQFT', 'YEARBUILT', 'LANDUSE', 'STATECLASS', 'SALEDATE', 'SALEPRICE', 'COUNTY', 'LANDVAL', 'BLDGVAL', 'TOTALVAL', 'ASSESSVAL'],
    owner: { OWNERTYPE: 'SECRET TYPE' },
    lot: { TLID: '1S1E01AB  1200', SITEADDR: '1234 SE MAIN ST', SITECITY: 'PORTLAND', SITEZIP: '97214', BLDGSQFT: 1800, YEARBUILT: 1912, LANDUSE: 'SFR', STATECLASS: '101',
      SALEDATE: '2018-05-01', SALEPRICE: 560000, COUNTY: 'M', LANDVAL: 250000, BLDGVAL: 400000, TOTALVAL: 650000, ASSESSVAL: 310000 },
    card: [/1234 SE Main St \|/, /Portland · Single-family home/, /REAL MARKET VALUE \| \$650,000/i, /Last sold \$560,000 · May 2018/] },
  ID_ADA: { url: 'https://services2.arcgis.com/dgGjZc6xAH5m5JyP/arcgis/rest/services/Parcels/FeatureServer/5', spot: [43.6000, -116.2600],
    fields: ['OBJECTID', 'PARCEL', 'PROPYEAR', 'PROPCODE', 'ADDRESS', 'CITY_STATE', 'TOTALVALUE', 'PROPUNIT', 'ACRES'],
    owner: { LEGAL1: 'SECRET LEGAL' },
    lot: { PARCEL: 'R2919020110', PROPYEAR: 2026, PROPCODE: 'R', ADDRESS: '6242 W DAYTONA CIR                ', CITY_STATE: 'BOISE, ID 83709-0000          ', TOTALVALUE: 432900 },
    card: [/6242 W Daytona Cir \|/, /Boise · Residential/, /\$432,900/] },
  MI_OAKLAND: { url: 'https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseOpenParcelDataMapService/MapServer/1', spot: [42.4890, -83.1410],
    fields: ['OBJECTID', 'KEYPIN', 'PIN', 'CLASSCODE', 'SITEADDRESS', 'SITECITY', 'SITEZIP5', 'ASSESSEDVALUE', 'TAXABLEVALUE', 'NUM_BEDS', 'NUM_BATHS', 'STRUCTURE_DESC', 'LIVING_AREA_SQFT'],
    owner: { NAME1: 'SECRET OWNER', NAME2: 'SECRET OWNER 2', POSTALADDRESS: 'SECRET MAILING' },
    lot: { KEYPIN: '2522104023', PIN: '2522104023', CLASSCODE: '401', SITEADDRESS: '203 S TROY ST', SITECITY: 'ROYAL OAK', SITEZIP5: '48067', ASSESSEDVALUE: 150000,
      TAXABLEVALUE: 98000, NUM_BEDS: 3, NUM_BATHS: 2, STRUCTURE_DESC: 'SINGLE FAMILY', LIVING_AREA_SQFT: 1400 },
    card: [/203 S Troy St \|/, /Royal Oak · Single-family home/, /\$300,000/, /twice the assessed value/] },
  MI_MACOMB: { url: 'https://services6.arcgis.com/K0qS4r8AEJxrE8em/arcgis/rest/services/Macomb_County_Parcel_Data/FeatureServer/10', spot: [42.4970, -82.8880],
    fields: ['OBJECTID', 'TAX_ID', 'ADDRESS', 'TAX_TYPE', 'CVT_NAME', 'TAX_URL', 'BSA_ID', 'propstreetcombined', 'propertyCityStateZip', 'zoning', 'mborsev_0', 'mbortax'],
    owner: { ownername1: 'SECRET OWNER', LEGAL: 'SECRET LEGAL' },
    lot: { TAX_ID: '14-14-361-001', ADDRESS: '22500 SHOREWOOD DR', CVT_NAME: 'SAINT CLAIR SHORES', propertyCityStateZip: 'ST CLAIR SHORES, MI 48081', mborsev_0: 236600, mbortax: 145996,
      TAX_URL: 'https://bsaonline.com/SiteSearch/SiteSearchResults?UsingAccountNumber=true&SearchText=09-14-14-361-001&uid=261' },
    card: [/22500 Shorewood Dr \|/, /\$473,200/, /BS&A/] },
  KS_SEDGWICK: { url: 'https://gismaps.wichita.gov/ageweb/rest/services/COWGIS/Property_and_Location/MapServer/4', spot: [37.6890, -97.3000],
    fields: ['OBJECTID', 'PIN', 'Prop_Addr', 'Prop_City', 'Prop_zip', 'Class', 'LandVal', 'ImprVal', 'TotVal', 'YrBuilt', 'SFLA', 'BedRooms', 'FullBath', 'HalfBath', 'Prop_AddrUnit',
      'FunctionDs', 'LivingUnits'],
    owner: { Owner: 'SECRET OWNER', Owner_madd: 'SECRET MAILING', Legal: 'SECRET LEGAL' },
    lot: { PIN: '00152384', Prop_Addr: '225 N LORRAINE AVE', Prop_City: 'WICHITA', Prop_zip: '67214', Class: 'R', LandVal: 22300, ImprVal: 48800, TotVal: 71100, YrBuilt: 1920,
      SFLA: 1100, BedRooms: 3, FullBath: 1, HalfBath: 0, LivingUnits: 1 },
    card: [/225 N Lorraine Ave \|/, /Wichita · Single-family home/, /APPRAISED VALUE \| \$71,100/i, /Built 1920/] },
  GA_ATLANTA: { url: 'https://gis.atlantaga.gov/dpcd/rest/services/AdministrativeArea/TaxParcel/MapServer/0', spot: [33.7800, -84.3600],
    fields: ['OBJECTID', 'PARCELID', 'CLASSCD', 'LIVUNITS', 'SITEADDRESS', 'SITECITY', 'SITEZIP', 'TOT_APPR', 'LANDAPPR', 'IMPR_APPR', 'CNTASSDVAL', 'TAXYEAR'],
    owner: { OWNERNME1: 'SECRET OWNER', PSTLADDRESS: 'SECRET MAILING', CNVYNAME: 'SECRET CONVEYANCE' },
    lot: { PARCELID: '17 005300140236', CLASSCD: 'R3', LIVUNITS: 1, SITEADDRESS: '864 ADAIR AVE NE', SITECITY: 'ATLANTA', SITEZIP: '30306', TOT_APPR: 1250000, LANDAPPR: 400200,
      IMPR_APPR: 849800, CNTASSDVAL: 500000, TAXYEAR: 2025 },
    card: [/864 Adair Ave NE \|/, /Atlanta · Single-family home/, /FAIR MARKET VALUE · 2025 TAX YEAR \| \$1,250,000/i] },
  AZ_MARICOPA: { url: 'https://gis.maricopa.gov/arcgis/rest/services/IndividualService/Parcel/MapServer/1', spot: [33.4200, -111.9400],
    fields: ['OBJECTID', 'APN', 'PropertyFullStreetAddress', 'PropertyCity', 'PropertyZipCode', 'SalePrice', 'SaleDate', 'AssessorWebLink', 'ParcelValuationYear', 'FullCashValue',
      'LimitedPropertyValue', 'LandFullCashValue', 'ImprovementFullCashValue', 'PropertyUseCode', 'PropertyUseDescription', 'ConstructionYear', 'LivableArea_SqFt', 'Stories'],
    owner: { OwnerName: 'SECRET OWNER', OwnerAddressLine1: 'SECRET MAILING', TaxOwnerName: 'SECRET TAX OWNER', DeedNumber: 'SECRET DEED', PropertyDescription: 'SECRET LEGAL' },
    lot: { APN: '13234567', PropertyFullStreetAddress: '1120 E LEMON ST', PropertyCity: 'TEMPE', PropertyZipCode: '85281', SalePrice: 410000, SaleDate: 1594771200000,
      AssessorWebLink: 'https://mcassessor.maricopa.gov/mcs/?q=13234567', ParcelValuationYear: 2026, FullCashValue: 520000, LimitedPropertyValue: 300000, LandFullCashValue: 104000,
      ImprovementFullCashValue: 416000, PropertyUseCode: '0131', PropertyUseDescription: 'SFR GRADE 010-3 URBAN SUBDIVIDED', ConstructionYear: 1962, LivableArea_SqFt: 1500 },
    card: [/1120 E Lemon St \|/, /Tempe · Single-family home/, /FULL CASH VALUE · 2026 TAX YEAR \| \$520,000/i, /Last sold \$410,000 · Jul 2020/, /Maricopa County Assessor’s page/] },
  ME: { url: 'https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Parcels_Organized_Towns/FeatureServer/10', spot: [43.6594, -70.2601],
    fields: ['OBJECTID', 'TOWN', 'COUNTY', 'MAP_BK_LOT', 'PROP_LOC', 'GEOCODE', 'STATE_ID', 'TYPE'],
    owner: {},
    lot: { STATE_ID: '05170_033  K008', PROP_LOC: '00341 CUMBERLAND AVE', TOWN: 'Portland', COUNTY: 'Cumberland', MAP_BK_LOT: '033  K008' },
    table: [{ STATE_ID: '05170_033  K008', LAND_VAL: 118300, BLDG_VAL: 300000, LS_DATE: -2209143600000, LS_PRICE: 0, LAND_USE_D: 'SINGLE FAM', LIV_UNITS: 1, RES_AREA: 1800 }],
    card: [/341 Cumberland Ave \|/, /Portland · Single-family home/, /ASSESSED VALUE \| \$418,300/i] },
  CA_LA: { url: 'https://rpgis.isd.lacounty.gov/arcgis/rest/services/GISNET_Public/MapServer/333', spot: [33.8350, -118.3400],
    fields: ['OBJECTID', 'AIN', 'APN', 'SitusAddress', 'SitusCity', 'SitusZIP', 'TaxRateArea', 'UseDescription', 'TaxRateCity', 'UseCode', 'UseType', 'DesignType1',
      'YearBuilt1', 'Units1', 'Bedrooms1', 'Bathrooms1', 'SQFTmain1', 'EffectiveYear1', 'Roll_Year', 'Roll_LandValue', 'Roll_ImpValue', 'Roll_LandBaseYear',
      'Roll_ImpBaseYear', 'SitusFullAddress'],
    owner: { RecDate: 'SECRET RECORDING', RecDocNo: 'SECRET DEED' },
    lot: { APN: '7362-003-099', SitusAddress: '1320 MAPLE AVE', SitusCity: 'TORRANCE CA', SitusZIP: '90503-5923', UseCode: '0100', UseDescription: 'Single',
      UseType: 'Residential', YearBuilt1: '1951', Units1: 1, Bedrooms1: 3, Bathrooms1: 2, SQFTmain1: 1400, Roll_Year: '2026', Roll_LandValue: 500000, Roll_ImpValue: 200000 },
    card: [/1320 Maple Ave \|/, /Torrance · Single-family home/, /ASSESSED VALUE[^|]*\| \$700,000/i, /Proposition 13/, /Built 1951/, /Los Angeles County Assessor’s page/] },
  PA_PHILA: { url: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/PWD_PARCELS/FeatureServer/0', spot: [40.0350, -75.2150],
    fields: ['OBJECTID', 'parcelid', 'tencode', 'address', 'bldg_code', 'bldg_desc', 'brt_id', 'num_brt', 'num_accounts', 'gross_area', 'pin', 'parcel_id'],
    owner: { owner1: 'SECRET OWNER', owner2: 'SECRET OWNER 2' },
    lot: { brt_id: '213269999', address: '540 DUPONT ST', bldg_desc: 'SEMI DET 2 STY MASONRY', num_brt: 1, num_accounts: 1, parcelid: 99999 },
    carto: [{ parcel_number: '213269999', location: '540 DUPONT ST', unit: null, zip_code: '19128', category_code_description: 'SINGLE FAMILY',
      building_code_description: 'SEMI/DET 2 STY MASONRY', market_value: 410000, taxable_land: 80000, taxable_building: 330000, exempt_land: 0, exempt_building: 0,
      year_built: '1925', year_built_estimate: 'N', total_livable_area: 1500, number_of_bedrooms: 3, number_of_bathrooms: 1, number_stories: 2,
      sale_date: '2019-06-14T04:00:00Z', sale_price: 305000 }],
    card: [/540 Dupont St \|/, /Philadelphia · Twin \(semi-detached\)/, /\$410,000/, /Last sold \$305,000 · Jun 2019/, /Built 1925/, /Philadelphia’s property page/] },
  PA_ALLEGHENY: { url: 'https://gisdata.alleghenycounty.us/arcgis/rest/services/OPENDATA/Parcels/MapServer/0', spot: [40.3770, -80.0450],
    fields: ['OBJECTID', 'PIN', 'MAPBLOCKLOT', 'MUNICODE', 'CALCACREAGE'],
    owner: {},
    lot: { PIN: '0141N00099000000', MAPBLOCKLOT: '141-N-99', MUNICODE: 935, CALCACREAGE: 0.2 },
    wprdc: [{ PARID: '0141N00099000000', PROPERTYHOUSENUM: '31', PROPERTYFRACTION: ' ', PROPERTYADDRESS: 'ELM DR', PROPERTYUNIT: ' ', PROPERTYZIP: '15228',
      MUNIDESC: 'Mt.Lebanon  ', CLASSDESC: 'RESIDENTIAL', USEDESC: 'SINGLE FAMILY', SALEDATE: '04-14-2021', SALEPRICE: 520000, FAIRMARKETTOTAL: 250000,
      FAIRMARKETLAND: 60000, FAIRMARKETBUILDING: 190000, YEARBLT: 1924, FINISHEDLIVINGAREA: 2100, BEDROOMS: 4, FULLBATHS: 2, HALFBATHS: 1, STORIES: '2', STYLEDESC: 'COLONIAL' }],
    card: [/31 Elm Dr \|/, /Mt\. Lebanon · Single-family home/, /\$250,000/, /2012/, /Last sold \$520,000 · Apr 2021 \(\d+ yrs ago\) \|/] },
  TX_TRAVIS: { url: 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD/MapServer/0', spot: [30.3050, -97.7270],
    fields: ['OBJECTID', 'PROP_ID', 'geo_id', 'situs_num', 'situs_street', 'situs_zip', 'situs_address', 'abs_subdv_cd', 'sub_dec', 'land_state_cd', 'land_type_desc',
      'entities', 'tcad_acres', 'GIS_acres', 'legal_acre', 'F1year_imprv', 'market_value', 'appraised_val', 'assessed_val', 'imprv_homesite_val', 'imprv_non_homesite_val',
      'land_homesite_val', 'land_non_homesite_val', 'hyperlink', 'situs_street_prefx', 'situs_street_suffix', 'situs_city', 'LOTS'],
    owner: { py_owner_id: 'SECRET ID', py_owner_name: 'SECRET OWNER', py_address: 'SECRET MAILING', deed_num: 'SECRET DEED', deed_book_id: 'SECRET BOOK',
      deed_book_page: 'SECRET PAGE', deed_date: 'SECRET DATE', legal_desc: 'SECRET LEGAL' },
    lot: { PROP_ID: 215999, situs_num: '4211', situs_street_prefx: ' ', situs_street: 'AVENUE H', situs_street_suffix: ' ', situs_city: 'AUSTIN', situs_zip: '78751',
      land_state_cd: 'A1', land_type_desc: 'SINGLE FAMILY RESIDENCE', F1year_imprv: 1930, market_value: 700000, appraised_val: 700000, assessed_val: 650000,
      imprv_homesite_val: 300000, imprv_non_homesite_val: 0, land_homesite_val: 400000, land_non_homesite_val: '0', hyperlink: 'https://travis.prodigycad.com/property-detail/215999' },
    card: [/4211 Avenue H \|/, /Austin · Single-family home/, /MARKET VALUE \(TCAD\)[^|]*\| \$700,000/i, /Texas doesn’t make sale prices public/, /Travis Central Appraisal District’s page/] },
  TX_BEXAR: { url: 'https://maps.bexar.org/arcgis/rest/services/Parcels/MapServer/0', spot: [29.4870, -98.4650],
    fields: ['OBJECTID', 'PropID', 'Situs', 'AcctNumb', 'LandVal', 'ImprVal', 'TotVal', 'Nbhd', 'GBA', 'TOT_GBA', 'YrBlt', 'Stories', 'NumRooms', 'Houses', 'Detached',
      'State_cd', 'LglAcres', 'Acres', 'TaxUnits', 'Exempts', 'IS_UDI', 'UDIPARNT', 'Roll', 'SWP', 'PropUse'],
    owner: { Owner: 'SECRET OWNER', AddrLn1: 'SECRET MAILING', AddrLn2: 'SECRET MAILING 2', AddrLn3: 'SECRET MAILING 3', AddrCity: 'SECRET CITY', AddrSt: 'SECRET ST',
      Zip: 'SECRET ZIP', Zip4: 'SECRET Z4', Country: 'SECRET COUNTRY', DBA: 'SECRET DBA', LglDesc: 'SECRET LEGAL' },
    lot: { PropID: 346999, Situs: '150 WILDROSE AVE \r\nALAMO HEIGHTS, TX 78209', State_cd: 'A1', PropUse: '001', LandVal: 350000, ImprVal: 500000, TotVal: 850000,
      YrBlt: '1928', GBA: '2400', Stories: '2' },
    card: [/150 Wildrose Ave \|/, /Alamo Heights · Single-family home/, /MARKET VALUE \(BCAD\)[^|]*\| \$850,000/i, /Built 1928/] },
  IN: { url: 'https://gisdata.in.gov/server/rest/services/Hosted/Parcel_Boundaries_of_Indiana_Current/FeatureServer/0', spot: [39.7900, -86.1500],
    fields: ['objectid', 'state_parcel_id', 'parcel_id', 'prop_add', 'prop_city', 'prop_state', 'prop_zip', 'dlgf_prop_class_code', 'county_fips', 'tax_county'],
    owner: {},
    lot: { state_parcel_id: '490636158178000101', parcel_id: '49-06-36-158-178.000-101', prop_add: '1520 N DELAWARE ST', prop_city: 'INDIANAPOLIS', prop_zip: '46202', dlgf_prop_class_code: '510', tax_county: 'MARION' },
    card: [/1520 N Delaware St \|/, /Indianapolis · Single-family home/, /Lot lines only/, /county assessor’s site/] },
  NH: { url: 'https://nhgeodata.unh.edu/hosting/rest/services/Hosted/CAD_ParcelMosaic/FeatureServer/1', spot: [43.2100, -71.5400],
    fields: ['objectid', 'pid', 'townid', 'town', 'slu', 'sluc', 'streetaddress', 'nbc'],
    owner: { name: 'SECRET OWNER' },
    lot: { pid: '4046-3288', town: 'Concord', streetaddress: '12 PLEASANT ST' },
    card: [/12 Pleasant St \|/, /Concord/, /Lot lines only/, /town’s assessor/] },
  WV: { url: 'https://services.wvgis.wvu.edu/arcgis/rest/services/Planning_Cadastre/WV_Parcels/MapServer/0', spot: [39.6300, -79.9550],
    fields: ['OBJECTID', 'CleanParcelID', 'CountyID', 'COUNTY', 'FullPhysicalAddress', 'CALC_ACRE'],
    owner: { FullOwnerName: 'SECRET OWNER', FullOwnerAddress: 'SECRET MAILING', FullLegalDescription: 'SECRET LEGAL', OWNER1: 'SECRET OWNER 1' },
    lot: { CleanParcelID: '31110010002500000000', FullPhysicalAddress: '345 SPRUCE ST, MORGANTOWN, WV 26505' },
    card: [/345 Spruce St \|/, /Morgantown/, /Lot lines only/] },
  NV: { url: 'https://arcgis.water.nv.gov/arcgis/rest/services/BaseLayers/County_Parcels_in_Nevada/MapServer/0', spot: [39.5200, -119.8100],
    fields: ['OBJECTID', 'APN', 'SiteCity', 'Website', 'Acres', 'County', 'PIN'],
    owner: {},
    lot: { APN: '1122607', SiteCity: 'RENO', Website: 'https://www.washoecounty.gov/assessor/cama/?parid=01122607', County: 'Washoe' },
    card: [/26 Hillcrest Road \|/, /On the county’s site/, /County assessor’s page/] },
  HI: { url: 'https://geodata.hawaii.gov/arcgis/rest/services/ParcelsZoning/MapServer/25', spot: [21.2790, -157.8000],
    fields: ['objectid', 'tmk', 'tmk_txt', 'county', 'island', 'qpub_link', 'gisacres'],
    owner: {},
    lot: { tmk_txt: '1-3-2-033-012', county: 'Honolulu', island: 'OAH', qpub_link: 'https://qpublic.schneidercorp.com/Application.aspx?AppID=1045&PageTypeID=4&KeyValue=132033012' },
    card: [/26 Hillcrest Road \|/, /On the county’s site/, /qPublic/] },
  DE: { url: 'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_StateParcels/FeatureServer/0', spot: [39.7500, -75.5500],
    fields: ['OBJECTID', 'PIN', 'ACRES', 'COUNTY'],
    owner: {},
    lot: { PIN: '2602820042', ACRES: 0.07, COUNTY: 'New Castle' },
    card: [/26 Hillcrest Road \|/, /Lot lines only/, /New Castle, Kent or Sussex/] },
  VA: { url: 'https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0', spot: [37.5500, -77.4600],
    fields: ['OBJECTID', 'VGIN_QPID', 'FIPS', 'LOCALITY', 'PARCELID', 'PTM_ID'],
    owner: {},
    lot: { PARCELID: '262174', LOCALITY: 'Richmond City', PTM_ID: 'W0000608040' },
    card: [/26 Hillcrest Road \|/, /Lot lines only/, /county or city assessor/] },
};
const ME_TABLE = R.ME.url.replace(/\/10$/, '/9');
// Philadelphia's property office table (Carto) and Allegheny's assessments (WPRDC, by JSONP): what each was asked, and a condo's units
const cartoAsked = [], wprdcAsked = [];
const PHL_CONDO = [['888001103', '101'], ['888092750', '905'], ['888092788', '1006']].map(([parcel_number, unit]) => ({ ...R.PA_PHILA.carto[0], parcel_number,
  location: '219-29 S 18TH ST', unit, category_code_description: 'SINGLE FAMILY', building_code_description: 'RES CONDO 5+ STY MASONRY', market_value: 300000 + +unit * 100 }));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const asked = {}, tableAsked = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith('https://api.geoapify.com/v1/geocode/reverse')) { const q = new URL(u).searchParams;
    return json({ results: [{ housenumber: '26', street: 'Hillcrest Road', distance: 12, lat: +q.get('lat'), lon: +q.get('lon') }] }); }
  if (u.startsWith('https://phl.carto.com/api/v2/sql')) { const q = new URLSearchParams(req.postData() || u.split('?')[1] || '').get('q') || ''; cartoAsked.push(q);
    const rows = [...R.PA_PHILA.carto, ...PHL_CONDO].filter((r) => (q.includes('parcel_number IN') && q.includes(`'${r.parcel_number}'`)) || (q.includes('location IN') && q.includes(`'${r.location}'`)));
    return json({ rows }); }
  if (u.startsWith('https://data.wprdc.org/api/3/action/datastore_search_sql')) { const p = new URL(u).searchParams, sql = p.get('sql') || ''; wprdcAsked.push(sql);
    const recs = R.PA_ALLEGHENY.wprdc.filter((r) => sql.includes(`'${r.PARID}'`));
    return req.respond({ status: 200, contentType: 'application/javascript', body: `${p.get('callback')}(${JSON.stringify({ success: true, result: { records: recs } })})` }); }
  if (u.startsWith(ME_TABLE + '/query')) { const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : u.split('?')[1]); tableAsked.push(q.get('outFields') || '');
    return json({ features: R.ME.table.filter((r) => (q.get('where') || '').includes(r.STATE_ID)).map((attributes) => ({ attributes })) }); }
  for (const [rid, c] of Object.entries(R)) {
    if (u.startsWith(c.url + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, geometryType: 'esriGeometryPolygon', fields: [...c.fields, ...Object.keys(c.owner)].map((name) => ({ name })) });
    if (u.startsWith(c.url + '/query')) {
      const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : u.split('?')[1]);
      (asked[rid] = asked[rid] || []).push(q.get('outFields') || '');
      if (!q.get('geometry')) return json({ features: [] });
      const g = q.get('geometry').split(',').map(Number);
      return json({ features: [{ geometry: { rings: [ring(...LOT, [g[0], g[1]])] }, attributes: { OBJECTID: 1, ...c.owner, ...c.lot } }] });
    }
  }
  return req.abort();
});
await page.goto(ORIGIN + '/');
await page.click('#goMap'); await sleep(300);

// Outlines: each region holds its own places, and the lines between states and counties fall where they should
const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  const P = { houston: [29.7604, -95.3698], katy: [29.7858, -95.8245], fortWorth: [32.7555, -97.3308], dallas: [32.7767, -96.797], austin: [30.2672, -97.7431],
    oakland: [37.8044, -122.2712], sanFrancisco: [37.7749, -122.4194], redlands: [34.0556, -117.1825], needles: [34.8481, -114.6141], laughlinNV: [35.1678, -114.5730],
    columbus: [39.9612, -82.9988], cincinnati: [39.1031, -84.512], lawrenceburgIN: [39.0909, -84.85], covingtonKY: [39.0837, -84.5086], nashville: [36.1627, -86.7816],
    bismarck: [46.8083, -100.7837], mandan: [46.8267, -100.8896], portland: [45.5152, -122.6784], vancouverWA: [45.6387, -122.6615], beaverton: [45.4871, -122.8037],
    boise: [43.615, -116.2023], royalOak: [42.4895, -83.1446], detroit: [42.3314, -83.0458], mountClemens: [42.5973, -82.878], wichita: [37.6872, -97.3301],
    atlanta: [33.749, -84.388], decatur: [33.7748, -84.2963], phoenix: [33.4484, -112.074], tucson: [32.2226, -110.9747], indianapolis: [39.7684, -86.1581],
    concord: [43.2081, -71.5376], hanover: [43.7022, -72.2896], whiteRiverVT: [43.6487, -72.3193], charleston: [38.3498, -81.6326], harpersFerry: [39.3254, -77.7389],
    reno: [39.5296, -119.8138], lasVegas: [36.1699, -115.1398], honolulu: [21.3069, -157.8583], hilo: [19.7241, -155.0868], wilmington: [39.7391, -75.5398],
    richmond: [37.5407, -77.436], arlington: [38.8816, -77.091], georgetownDC: [38.9097, -77.0654], bristolVA: [36.5951, -82.1887], virginiaBeach: [36.8529, -75.978],
    currituckNC: [36.4507, -76.0168], portlandME: [43.6591, -70.2568], kitteryME: [43.0882, -70.7362], portsmouthNH: [43.0718, -70.7626], bangor: [44.8016, -68.7712],
    salisburyMD: [38.3607, -75.5994], cumberlandMD: [39.6528, -78.7625], keyserWV: [39.4362, -78.9817], keyWestFL: [24.5551, -81.78], memphis: [35.1495, -90.049],
    losAngeles: [34.0522, -118.2437], longBeach: [33.7701, -118.1937], avalon: [33.3428, -118.3278], pomona: [34.0551, -117.75], upland: [34.0975, -117.6484],
    anaheim: [33.8366, -117.9143], thousandOaks: [34.1706, -118.8376], philadelphia: [39.9526, -75.1652], camden: [39.9259, -75.1196], jenkintown: [40.0959, -75.1252],
    pittsburgh: [40.4406, -79.9959], washingtonPA: [40.174, -80.2462], harrisburg: [40.2732, -76.8867], sanAntonio: [29.4241, -98.4936], newBraunfels: [29.703, -98.1245],
    sanMarcos: [29.8833, -97.9414], roundRock: [30.5083, -97.6789] };
  return Object.fromEntries(Object.entries(P).map(([k, [a, o]]) => [k, f(a, o)]));
});
console.log('regions:', JSON.stringify(rg));
const wantR = { houston: 'TX_HARRIS', katy: 'TX_HARRIS', fortWorth: 'TX_TARRANT', dallas: 'US_TX', austin: 'TX_TRAVIS', oakland: 'CA_ALAMEDA', sanFrancisco: 'US_CA', redlands: 'CA_SBD',
  needles: 'CA_SBD', laughlinNV: 'NV', columbus: 'OH_FRANKLIN', cincinnati: 'OH_HAMILTON', lawrenceburgIN: 'IN', covingtonKY: 'US_KY', nashville: 'TN_DAVIDSON',
  bismarck: 'ND_BISMARCK', mandan: 'US_ND', portland: 'OR_METRO', vancouverWA: 'WA', beaverton: 'OR_METRO', boise: 'ID_ADA', royalOak: 'MI_OAKLAND', detroit: 'US_MI',
  mountClemens: 'MI_MACOMB', wichita: 'KS_SEDGWICK', atlanta: 'GA_ATLANTA', decatur: 'US_GA', phoenix: 'AZ_MARICOPA', tucson: 'US_AZ', indianapolis: 'IN', concord: 'NH',
  hanover: 'NH', whiteRiverVT: 'VT', charleston: 'WV', harpersFerry: 'WV', reno: 'NV', lasVegas: 'NV', honolulu: 'HI', hilo: 'HI', wilmington: 'DE', richmond: 'VA',
  arlington: 'VA', georgetownDC: 'DC', bristolVA: 'VA', virginiaBeach: 'VA', currituckNC: 'NC', portlandME: 'ME', kitteryME: 'ME', portsmouthNH: 'NH', bangor: 'ME',
  salisburyMD: 'MD', cumberlandMD: 'MD', keyserWV: 'WV', keyWestFL: 'FL', memphis: 'US_TN', losAngeles: 'CA_LA', longBeach: 'CA_LA', avalon: 'CA_LA', pomona: 'CA_LA',
  upland: 'CA_SBD', anaheim: 'US_CA', thousandOaks: 'US_CA', philadelphia: 'PA_PHILA', camden: 'NJ', jenkintown: 'US_PA', pittsburgh: 'PA_ALLEGHENY', washingtonPA: 'US_PA',
  harrisburg: 'US_PA', sanAntonio: 'TX_BEXAR', newBraunfels: 'US_TX', sanMarcos: 'US_TX', roundRock: 'US_TX' };
const badR = Object.entries(wantR).filter(([k, v]) => rg[k] !== v).map(([k, v]) => `${k}: ${rg[k]} (want ${v})`);
check(!badR.length, 'places land in the right state or county, along the lines too (outside the counties, the state’s basic card)' + (badR.length ? ': ' + badR.join(', ') : ''));

// Compass: near the World Magnetic Model (2026.9) at a place in each
const decl = await page.evaluate(() => [[29.76, -95.37], [32.76, -97.33], [37.8, -122.27], [34.06, -117.18], [39.96, -83.0], [39.1, -84.51], [36.16, -86.78], [46.81, -100.78],
  [45.52, -122.68], [43.62, -116.2], [42.49, -83.14], [42.6, -82.88], [37.69, -97.33], [33.75, -84.39], [33.45, -112.07], [43.66, -70.26], [39.77, -86.16], [43.21, -71.54],
  [38.35, -81.63], [36.17, -115.14], [21.31, -157.86], [39.74, -75.54], [37.54, -77.44], [34.05, -118.24], [39.95, -75.17], [40.44, -80.0], [30.27, -97.74],
  [29.42, -98.49], [33.34, -118.33]].map(([a, o]) => +window.__hp.regionFor(a, o).declination(a, o).toFixed(1)));
const wantD = [1.7, 2.8, 12.8, 11.1, -7.2, -6.1, -4.3, 5.4, 14.5, 12.6, -7.5, -7.7, 2.9, -5.6, 9.6, -14.4, -5.0, -13.9, -7.9, 11.0, 9.3, -11.6, -10.3,
  11.3, -11.8, -9.2, 3.1, 3.5, 11.2];
const offD = decl.map((d, i) => Math.abs(d - wantD[i]) < 0.8 ? null : `${i}: ${d} (want ${wantD[i]})`).filter(Boolean);
check(!offD.length, `compass declination near the World Magnetic Model${offD.length ? ': ' + offD.join(', ') : ''}`);

// Property types from each county's codes
const kinds = await page.evaluate(() => {
  const k = (rid, r) => window.__hp.useKind({ TOTAL_VAL: 300000, BLDG_VAL: 200000, ...r }, rid);
  return {
    hcadHouse: k('TX_HARRIS', { USE_CODE: 'A1', LAND_USE: '1001' }), hcadCondo: k('TX_HARRIS', { USE_CODE: 'Z1', LAND_USE: '1006' }), hcadDuplex: k('TX_HARRIS', { USE_CODE: 'B2' }),
    hcadApts: k('TX_HARRIS', { USE_CODE: 'B1' }), hcadLot: k('TX_HARRIS', { USE_CODE: 'C1' }), hcadExempt: k('TX_HARRIS', { USE_CODE: 'X1' }),
    alaHouse: k('CA_ALAMEDA', { USE_CODE: '1100' }), alaCondo: k('CA_ALAMEDA', { USE_CODE: '7300' }), alaCommon: k('CA_ALAMEDA', { USE_CODE: '7390' }),
    alaFourplex: k('CA_ALAMEDA', { USE_CODE: '2400' }), alaApts: k('CA_ALAMEDA', { USE_CODE: '7700' }), alaExempt: k('CA_ALAMEDA', { USE_CODE: '0300' }),
    ohHouse: k('OH_FRANKLIN', { USE_CODE: '510' }), ohCondo: k('OH_HAMILTON', { USE_CODE: 550 }), ohApts: k('OH_FRANKLIN', { USE_CODE: '401' }), ohLot: k('OH_FRANKLIN', { USE_CODE: '500' }),
    ohChurch: k('OH_FRANKLIN', { USE_CODE: '685' }), inHouse: k('IN', { USE_CODE: '510' }), inCondo: k('IN', { USE_CODE: '550' }), inFarm: k('IN', { USE_CODE: '101' }),
    inVacant: k('IN', { USE_CODE: '509' }), miHouse: k('MI_OAKLAND', { USE_CODE: '401', USE_DESC: 'SINGLE FAMILY' }), miCondo: k('MI_OAKLAND', { USE_CODE: '407' }),
    miLot: k('MI_OAKLAND', { USE_CODE: '402' }), orHouse: k('OR_METRO', { USE_CODE: 'SFR', STATE_CLASS: '101' }), orApts: k('OR_METRO', { USE_CODE: 'MFR', STATE_CLASS: '701' }),
    orDuplex: k('OR_METRO', { USE_CODE: 'MFR', STATE_CLASS: '101' }), azTownhouse: k('AZ_MARICOPA', { USE_DESC: 'TH DEFAULT CODE' }),
    azCommon: k('AZ_MARICOPA', { USE_DESC: 'CONDOS/TH GRADE 070-3 COM AREA NOT PA' }), azMobile: k('AZ_MARICOPA', { USE_DESC: 'PLANNED MH SUB AFFIXED MOBILE HOME' }),
    tnCondo: k('TN_DAVIDSON', { FEATURE: 'Multistory Cond', USE_DESC: 'RESIDENTIAL CONDO' }), ksDuplex: k('KS_SEDGWICK', { USE_CODE: 'R', UNITS: 2 }),
    atlLot: k('GA_ATLANTA', { USE_CODE: 'R4', BLDG_VAL: 0 }), bisDuplex: k('ND_BISMARCK', { USE_DESC: 'RESIDENTIAL TWO FAMILY', UNITS: 2 }),
    sbdApts: k('CA_SBD', { USE_DESC: 'APARTMENT, 15 UNITS AND UP', USE_CODE: 'COMMERCIAL' }), meHouse: k('ME', { USE_DESC: 'Single Fam  MDL-01' }), nhNone: k('NH', {}),
    laHouse: k('CA_LA', { USE_CODE: '0100', LAND_USE: 'Residential' }), laCondo: k('CA_LA', { USE_CODE: '010C', LAND_USE: 'Residential' }),
    laConverted: k('CA_LA', { USE_CODE: '01HE', LAND_USE: 'Residential' }), laTwo: k('CA_LA', { USE_CODE: '0200', LAND_USE: 'Residential' }),
    laApts: k('CA_LA', { USE_CODE: '0501', LAND_USE: 'Residential' }), laLot: k('CA_LA', { USE_CODE: '010V', LAND_USE: 'Residential' }),
    laOffice: k('CA_LA', { USE_CODE: '1700', LAND_USE: 'Commercial' }), laOfficeCondo: k('CA_LA', { USE_CODE: '170C', LAND_USE: 'Commercial' }),
    phlRow: k('PA_PHILA', { USE_CODE: 'SINGLE FAMILY', USE_DESC: 'ROW 2 STY MASONRY' }), phlCondo: k('PA_PHILA', { USE_CODE: 'SINGLE FAMILY', USE_DESC: 'RES CONDO 5+ STY MASONRY' }),
    phlWaterOnly: k('PA_PHILA', { USE_DESC: 'APT 2-4  UNTS 2STY FRAME' }), phlMixed: k('PA_PHILA', { USE_CODE: 'MIXED USE', USE_DESC: 'STR/OFF+APTS 3STY MASONRY' }),
    alleHouse: k('PA_ALLEGHENY', { USE_CODE: 'RESIDENTIAL', USE_DESC: 'SINGLE FAMILY' }), alleTwo: k('PA_ALLEGHENY', { USE_CODE: 'RESIDENTIAL', USE_DESC: 'TWO FAMILY' }),
    alleGov: k('PA_ALLEGHENY', { USE_CODE: 'GOVERNMENT', USE_DESC: 'MUNICIPAL GOVERNMENT' }), alleCondo: k('PA_ALLEGHENY', { USE_CODE: 'RESIDENTIAL', USE_DESC: 'CONDOMINIUM' }),
    tcadDuplex: k('TX_TRAVIS', { USE_CODE: 'B2', USE_DESC: 'DUPLEX' }), tcadCondo: k('TX_TRAVIS', { USE_CODE: 'A4', USE_DESC: 'CONDOS' }),
    tcadApts: k('TX_TRAVIS', { USE_CODE: 'B1', USE_DESC: 'MULTIFAMILY' }), bexarHouse: k('TX_BEXAR', { USE_CODE: 'A1' }), bexarLot: k('TX_BEXAR', { USE_CODE: 'C1' }),
  };
});
const wantK = { hcadHouse: 'single', hcadCondo: 'resCondo', hcadDuplex: 'multi', hcadApts: 'apartments', hcadLot: 'vacant', hcadExempt: 'exempt', alaHouse: 'single',
  alaCondo: 'resCondo', alaCommon: 'condoMaster', alaFourplex: 'multi', alaApts: 'apartments', alaExempt: 'exempt', ohHouse: 'single', ohCondo: 'resCondo', ohApts: 'apartments',
  ohLot: 'vacant', ohChurch: 'exempt', inHouse: 'single', inCondo: 'resCondo', inFarm: 'farmForest', inVacant: 'vacant', miHouse: 'single', miCondo: 'resCondo', miLot: 'vacant',
  orHouse: 'single', orApts: 'apartments', orDuplex: 'multi', azTownhouse: 'single', azCommon: 'other', azMobile: 'mobile', tnCondo: 'resCondo', ksDuplex: 'multi',
  atlLot: 'vacant', bisDuplex: 'multi', sbdApts: 'apartments', meHouse: 'single', nhNone: 'unknown', laHouse: 'single', laCondo: 'resCondo', laConverted: 'resCondo',
  laTwo: 'multi', laApts: 'apartments', laLot: 'vacant', laOffice: 'commercial', laOfficeCondo: 'comCondo', phlRow: 'single', phlCondo: 'resCondo', phlWaterOnly: 'multi',
  phlMixed: 'mixed', alleHouse: 'single', alleTwo: 'multi', alleGov: 'exempt', alleCondo: 'resCondo', tcadDuplex: 'multi', tcadCondo: 'resCondo', tcadApts: 'apartments',
  bexarHouse: 'single', bexarLot: 'vacant' };
const badK = Object.entries(wantK).filter(([k, v]) => kinds[k] !== v).map(([k, v]) => `${k}: ${kinds[k]} (want ${v})`);
check(!badK.length, 'property types read as the right kind' + (badK.length ? ': ' + badK.join(', ') : ''));

// Search: a state covered county by county is searched in its counties; a state with none is outside
const inSt = await page.evaluate(() => ({ tx: window.__hp.regionsIn ? window.__hp.regionsIn('TX').map((r) => r.id) : null, sc: window.__hp.regionsIn ? window.__hp.regionsIn('SC').length : null }));
check(JSON.stringify(inSt.tx) === '["TX_HARRIS","TX_TARRANT","TX_TRAVIS","TX_BEXAR"]' && inSt.sc === 0, `Texas is searched in its four counties; South Carolina has nothing: ${JSON.stringify(inSt)}`);

// A card in each
async function cardAt(lat, lon) {
  return page.evaluate(async (lat, lon) => {
    const hp = window.__hp, S = hp.S;
    await hp.centerMap(lat, lon);
    const L = S.local[0];
    if (!L) return { err: 'no lots', help: document.querySelector('#mapHelpTxt').textContent };
    hp.selectLot(L); await new Promise((r) => setTimeout(r, 500));
    return { card: document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | '), lots: S.local.length };
  }, lat, lon);
}
for (const [rid, c] of Object.entries(R)) {
  const r = await cardAt(c.spot[0], c.spot[1]);
  console.log(`${rid} card:`, (r.card || JSON.stringify(r)).slice(0, 600));
  const miss = c.card.filter((re) => !re.test(r.card || ''));
  check(!miss.length, `${rid}: the card shows what the records have` + (miss.length ? ` (missing ${miss.join(' ')})` : ''));
  check(!/SECRET/.test(r.card || ''), `${rid}: no owner, mailing or legal text on the card`);
  const outs = (asked[rid] || []).join(',').split(',');
  const bad = Object.keys(c.owner).filter((f) => outs.includes(f));
  check(outs.filter(Boolean).length >= 1 && !bad.length, `${rid}: owner, mailing and legal fields are never asked for` + (bad.length ? `: ${bad.join(', ')}` : ''));
}
check(tableAsked.length && tableAsked.every((f) => !/OWN|MAIL/i.test(f)), `Maine: the assessing table is asked for values only: ${tableAsked[0]}`);
check(cartoAsked.length && cartoAsked.every((q) => !/owner|mailing|care_of|legal|book_and_page|registry|beginning_point/i.test(q)),
  `Philadelphia: the property office's table is asked for property columns only: ${(cartoAsked[0] || '').slice(0, 160)}`);
check(wprdcAsked.length && wprdcAsked.every((q) => !/OWNER|CHANGENOTICE|LEGAL|DEED/i.test(q)), `Allegheny: the assessments are asked for property columns only: ${(wprdcAsked[0] || '').slice(0, 160)}`);
// A Philadelphia condo building: one parcel holding several accounts; its units come by the building's address and stack on its outline
const condo = await page.evaluate(async () => {
  const hp = window.__hp, ring = [[-75.17, 39.949], [-75.1695, 39.949], [-75.1695, 39.9495], [-75.17, 39.9495], [-75.17, 39.949]];
  const feats = [{ geometry: { rings: [ring] }, attributes: { brt_id: '888001103', address: '219-29 S 18TH ST', num_brt: 3, bldg_desc: 'RES.CONDO.5+STY MASONRY' } }];
  const sv = { canon: new Map([['PROP_ID', 'brt_id'], ['SITE_ADDR', 'address'], ['BRT_COUNT', 'num_brt']]) };
  await hp.REGIONS.PA_PHILA.expand(feats, sv);
  return feats.map((f) => [f.attributes.brt_id, f.attributes.__SITE_ADDR, f.geometry === feats[0].geometry]);
});
check(condo.length === 3 && condo[0][1] === '219-29 S 18TH ST UNIT 101' && condo.every((x) => x[2]) && new Set(condo.map((x) => x[0])).size === 3,
  `Philadelphia: a condo building's units stack on its outline, each once: ${JSON.stringify(condo)}`);
check(!errors.length, 'no page errors: ' + errors.join(' | '));
await browser.close(); srv.close();
console.log(fails.length ? `\n${fails.length} failed` : '\nAll passed');
process.exit(fails.length ? 1 : 0);
