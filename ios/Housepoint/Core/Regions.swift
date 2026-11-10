import Foundation

/// One state's parcel data. Each state publishes its own layer with its own field names; records are mapped onto
/// one set of names (MassGIS-style) so the rest of the app doesn't care which state it's in. Only the fields listed
/// here are ever requested, so owner names never reach the phone.
struct Region {
    let id: String
    let name: String
    let west: Double, south: Double, east: Double, north: Double
    let services: [String]
    let items: [String]
    let discover: String
    let detect: [String]
    let fields: [String: [String]]
    let valueLabel: String
    let deltaWord: String
    let shareSource: String
    let ageBreaks: [Int]
    let yearLabel: (Int) -> String
    let source: (Int?) -> String
    let useLabel: (String?) -> String?

    func contains(_ lat: Double, _ lon: Double) -> Bool { lon >= west && lon <= east && lat >= south && lat <= north }
}

enum Regions {
    static let massGISService = "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/L3_TAXPAR_POLY_ASSESS_gdb/FeatureServer"

    static let ma = Region(
        id: "MA", name: "Massachusetts",
        west: -73.55, south: 41.18, east: -69.85, north: 42.89,
        services: [massGISService],
        items: [],
        discover: "orgid:hGdibHYSPO59RG1h AND type:\"Feature Service\" AND (title:L3 OR title:parcels OR title:TAXPAR)",
        detect: ["YEAR_BUILT", "TOTAL_VAL"],
        fields: Dictionary(uniqueKeysWithValues: ["LOC_ID", "PROP_ID", "MAP_PAR_ID", "POLY_TYPE", "SITE_ADDR", "ADDR_NUM", "FULL_STR", "LOCATION",
            "CITY", "ZIP", "TOWN_ID", "FY", "TOTAL_VAL", "BLDG_VAL", "LAND_VAL", "OTHER_VAL", "LOT_SIZE", "LOT_UNITS", "LS_DATE", "LS_PRICE",
            "USE_CODE", "YEAR_BUILT", "BLD_AREA", "UNITS", "RES_AREA", "STYLE", "STORIES", "NUM_ROOMS"].map { ($0, [$0]) }),
        valueLabel: "Town assessed value", deltaWord: "assessed",
        shareSource: "Massachusetts assessor records via MassGIS",
        ageBreaks: [1850, 1900, 1940, 1980],
        yearLabel: { "FY\($0)" },
        source: { fy in "Source: town assessor records via MassGIS\(fy.map { " (fiscal year \($0))" } ?? ""). Assessed value is the town’s figure for taxes, not a market estimate." },
        useLabel: { Regions.maUseLabel($0) })

    static let fl = Region(
        id: "FL", name: "Florida",
        west: -87.65, south: 24.39, east: -79.97, north: 31.0,
        services: ["https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer"],
        items: ["efa909d6b1c841d298b0a649e7f71cf2", "55e830fd6c8948baae1601fbfc33a3b2", "ff7b985e139c4c7ba844500053e8e185"],
        discover: "type:\"Feature Service\" AND (title:Cadastral OR title:\"Statewide Parcels\" OR title:\"Florida Parcels\" OR title:\"FDOR Parcels\")",
        detect: ["JV", "ACT_YR_BLT", "DOR_UC", "ACTYRBLT", "DORUC", "PHY_ADDR1", "PHYADDR1"],
        fields: [
            "PROP_ID": ["PARCEL_ID", "PARCELNO", "PARCELID"], "SITE_ADDR": ["PHY_ADDR1", "PHYADDR1"], "CITY": ["PHY_CITY", "PHYCITY"],
            "ZIP": ["PHY_ZIPCD", "PHY_ZIP", "PHYZIP"], "FY": ["ASMNT_YR"], "TOTAL_VAL": ["JV"], "LAND_VAL": ["LND_VAL", "LNDVAL"],
            "LS_PRICE": ["SALE_PRC1", "SALEPRC1"], "SALE_YR": ["SALE_YR1", "SALEYR1"], "SALE_MO": ["SALE_MO1", "SALEMO1"],
            "MULTI_SALE": ["MULTI_PAR_SAL1", "MULTI_PAR_", "MULTIPAR1"], "USE_CODE": ["DOR_UC", "DORUC"],
            "YEAR_BUILT": ["ACT_YR_BLT", "ACTYRBLT"], "EFF_YEAR": ["EFF_YR_BLT", "EFFYRBLT"], "RES_AREA": ["TOT_LVG_AREA", "TOT_LVG_AR", "TOTLVGAREA"],
            "UNITS": ["NO_RES_UNTS", "NO_RES_UNT", "NORESUNTS"], "BLDGS": ["NO_BULDNG", "NOBULDNG"],
            "COUNTY": ["CO_NO", "CONO"], "TV_NSD": ["TV_NSD", "TVNSD"], "TV_SD": ["TV_SD", "TVSD"],
        ],
        valueLabel: "County market value (“just value”)", deltaWord: "value",
        shareSource: "Florida property appraiser records via FL Dept. of Revenue",
        ageBreaks: [1940, 1970, 1990, 2010],
        yearLabel: { "\($0) tax roll" },
        source: { fy in "Source: Florida Department of Revenue tax roll from county property appraisers\(fy.map { " (\($0))" } ?? ""). Just value is the county’s market value estimate for taxes, not an appraisal." },
        useLabel: { Regions.flUseLabel($0) })

    static let all = [ma, fl]
    static func at(_ lat: Double, _ lon: Double) -> Region? { all.first { $0.contains(lat, lon) } }
    static func byId(_ id: String) -> Region { all.first { $0.id == id } ?? ma }
    static let allFields: Set<String> = Set(all.flatMap { $0.fields.keys }).union(["LS_DATE"])

    // MARK: use codes

    static let maCodes: [String: String] = [
        "101": "Single-family home", "102": "Condo", "103": "Mobile home", "104": "Two-family", "105": "Three-family",
        "106": "Accessory building", "109": "Multiple houses", "111": "Apartments, 4–8 units", "112": "Apartments, 9+ units",
        "130": "Vacant land", "131": "Vacant land", "132": "Vacant land",
        "900": "Federal property", "901": "State property", "902": "County property", "903": "Town or city property",
        "904": "School or college", "905": "Charitable organization", "906": "Religious organization", "908": "Housing authority",
    ]
    static let maFirst: [Character: String] = ["0": "Mixed use", "1": "Residential", "2": "Open space", "3": "Commercial", "4": "Industrial",
        "6": "Forest land", "7": "Farm land", "8": "Recreation land", "9": "Tax-exempt property"]

    static func digits(_ s: String?) -> String { (s ?? "").filter { $0.isNumber } }

    static func maUseLabel(_ code: String?) -> String? {
        let d = digits(code)
        guard d.count >= 3 else { return nil }
        let c3 = String(d.prefix(3))
        return maCodes[c3] ?? maFirst[c3.first!]
    }

    /// Florida condo (04) or residential common area (09).
    static func flCondoCode(_ code: String?) -> Bool {
        guard let n = Int(digits(code)) else { return false }
        return n == 4 || n == 9
    }

    static func flUseLabel(_ code: String?) -> String? {
        guard let n = Int(digits(code)) else { return nil }
        let r: [Int: String] = [0: "Vacant residential land", 1: "Single-family home", 2: "Mobile home", 3: "Apartments, 10+ units", 4: "Condo",
            5: "Co-op", 6: "Retirement home", 7: "Residential", 8: "Multi-family, under 10 units", 9: "Residential common area", 10: "Vacant commercial land"]
        if let s = r[n] { return s }
        return n < 40 ? "Commercial" : n < 50 ? "Industrial" : n < 70 ? "Farm land" : n < 80 ? "Institutional" : n < 90 ? "Government property" : "Other"
    }
}
