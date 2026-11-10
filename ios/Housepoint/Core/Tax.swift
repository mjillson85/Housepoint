import Foundation

/// Estimated property tax: a free calculation from public rates, not the actual bill.
struct TaxEstimate {
    var exempt = false
    var lo = 0.0
    var hi = 0.0
    var perUnit = false
    var notes: [String] = []        // markdown (**bold**)
    var buyer: Double?              // Florida: what a new owner living there would pay
}

enum Tax {
    /// Massachusetts FY2026 residential tax rates ($ per $1,000 of assessed value), in state town-ID order
    /// (1 = Abington ... 351 = Yarmouth; Aquinnah keeps Gay Head's old slot). Source: MA Division of Local Services, Tax Rates by Class.
    static let maFiscalYear = 2026
    static let maTowns: [(name: String, rate: Double)] = parse("""
        Abington|12.81,Acton|16.23,Acushnet|10.45,Adams|15.63,Agawam|14.1,Alford|4.07,Amesbury|15.05
        Amherst|16.91,Andover|12.31,Arlington|10.67,Ashburnham|14.87,Ashby|15.76,Ashfield|14.23
        Ashland|12.71,Athol|12.67,Attleboro|12.2,Auburn|14.24,Avon|13.35,Ayer|11.59,Barnstable|6.8
        Barre|13.35,Becket|9.56,Bedford|12.49,Belchertown|15.13,Bellingham|12.39,Belmont|11.51,Berkley|12.35
        Berlin|14.06,Bernardston|15.2,Beverly|10.81,Billerica|11.61,Blackstone|14.74,Blandford|12.57
        Bolton|18.07,Boston|12.4,Bourne|7.65,Boxborough|15.39,Boxford|13.54,Boylston|13.58,Braintree|10.06
        Brewster|6.77,Bridgewater|12.03,Brimfield|13.38,Brockton|11.63,Brookfield|14.62,Brookline|10.24
        Buckland|16.74,Burlington|8.69,Cambridge|6.67,Canton|9.75,Carlisle|12.82,Carver|13.61
        Charlemont|16.81,Charlton|10.94,Chatham|3.67,Chelmsford|13.27,Chelsea|11.48,Cheshire|10.58
        Chester|18.06,Chesterfield|15.26,Chicopee|15.24,Chilmark|2.28,Clarksburg|12.29,Clinton|12.98
        Cohasset|11.35,Colrain|17.82,Concord|13.05,Conway|14.28,Cummington|12.49,Dalton|16.87,Danvers|10.65
        Dartmouth|8.03,Dedham|12.3,Deerfield|13.45,Dennis|4.29,Dighton|12.45,Douglas|12.07,Dover|11.19
        Dracut|9.67,Dudley|10.06,Dunstable|13.39,Duxbury|9.96,East Bridgewater|13.69,East Brookfield|11.76
        East Longmeadow|19.43,Eastham|7.71,Easthampton|13.29,Easton|12.59,Edgartown|2.48,Egremont|6.58
        Erving|9.58,Essex|13.04,Everett|12.62,Fairhaven|9.19,Fall River|11.48,Falmouth|5.73,Fitchburg|13.29
        Florida|8.28,Foxborough|13,Framingham|11.83,Franklin|11.42,Freetown|9.78,Gardner|13.77,Aquinnah|6.87
        Georgetown|13.76,Gill|14.91,Gloucester|9.31,Goshen|13.5,Gosnold|3.16,Grafton|13.69,Granby|14.85
        Granville|14,Great Barrington|13.24,Greenfield|18.64,Groton|14.78,Groveland|12.98,Hadley|11.46
        Halifax|14.08,Hamilton|15.04,Hampden|15.78,Hancock|2.18,Hanover|12.47,Hanson|13.06,Hardwick|12.74
        Harvard|15.87,Harwich|5.81,Hatfield|14.67,Haverhill|10.61,Hawley|16.2,Heath|19.39,Hingham|10.47
        Hinsdale|10.63,Holbrook|12.11,Holden|13.48,Holland|12.2,Holliston|14.29,Holyoke|17.43,Hopedale|16.25
        Hopkinton|14.1,Hubbardston|11.18,Hudson|14.14,Hull|10.81,Huntington|14.77,Ipswich|10.78
        Kingston|12.82,Lakeville|9.74,Lancaster|16.9,Lanesborough|17.29,Lawrence|8.64,Lee|11.21
        Leicester|11.09,Lenox|9.85,Leominster|13.66,Leverett|15.7,Lexington|12.31,Leyden|14.69,Lincoln|12.31
        Littleton|14.02,Longmeadow|19.32,Lowell|11.35,Ludlow|16.01,Lunenburg|14.39,Lynn|10.3,Lynnfield|11.46
        Malden|11.4,Manchester-by-the-Sea|8.7,Mansfield|13.09,Marblehead|8.56,Marion|8.87,Marlborough|10.54
        Marshfield|9.61,Mashpee|6.41,Mattapoisett|10.24,Maynard|16.62,Medfield|13.52,Medford|8.63,Medway|14
        Melrose|11.47,Mendon|13.26,Merrimac|13.19,Methuen|10.4,Middleborough|13.12,Middlefield|16.88
        Middleton|12.59,Milford|12.69,Millbury|12.87,Millis|15.31,Millville|12.21,Milton|11.81,Monroe|10.13
        Monson|14.3,Montague|15.13,Monterey|7.22,Montgomery|11.59,Mount Washington|5.97,Nahant|8.99
        Nantucket|3.12,Natick|12.17,Needham|10.83,New Ashford|5.66,New Bedford|10.95,New Braintree|14.97
        New Marlborough|7.21,New Salem|13.62,Newbury|7.51,Newburyport|9.26,Newton|9.69,Norfolk|14.87
        North Adams|15.97,North Andover|11.24,North Attleborough|11.06,North Brookfield|11.96
        North Reading|13.02,Northampton|13.67,Northborough|14.82,Northbridge|11.63,Northfield|13.28
        Norton|13.03,Norwell|12.83,Norwood|9.82,Oak Bluffs|4.99,Oakham|11.12,Orange|16.6,Orleans|6.11
        Otis|5.96,Oxford|12.23,Palmer|16.66,Paxton|15.17,Peabody|9.47,Pelham|18.79,Pembroke|11.78
        Pepperell|13.78,Peru|16.09,Petersham|14.24,Phillipston|10.95,Pittsfield|17.5,Plainfield|17.56
        Plainville|11.29,Plymouth|12.55,Plympton|15.26,Princeton|13.44,Provincetown|6.13,Quincy|11.78
        Randolph|11.58,Raynham|11.75,Reading|10.96,Rehoboth|10.85,Revere|8.94,Richmond|10.25,Rochester|10.59
        Rockland|13.87,Rockport|8.46,Rowe|5.24,Rowley|12.09,Royalston|10.26,Russell|18.42,Rutland|13.87
        Salem|10.78,Salisbury|9.93,Sandisfield|7.89,Sandwich|10.19,Saugus|10.42,Savoy|14.52,Scituate|9.83
        Seekonk|12.27,Sharon|17.15,Sheffield|11.82,Shelburne|12.79,Sherborn|15.66,Shirley|12.39
        Shrewsbury|11.5,Shutesbury|16.21,Somerset|12.93,Somerville|10.98,South Hadley|13.52
        Southampton|13.11,Southborough|14.36,Southbridge|14.89,Southwick|14.42,Spencer|10.98
        Springfield|15.46,Sterling|12.55,Stockbridge|6.79,Stoneham|10.06,Stoughton|11.81,Stow|17.87
        Sturbridge|15.6,Sudbury|14.27,Sunderland|12.44,Sutton|11.55,Swampscott|12,Swansea|11.36
        Taunton|11.14,Templeton|11.87,Tewksbury|12.56,Tisbury|7.42,Tolland|7.95,Topsfield|15.66
        Townsend|13.75,Truro|6.17,Tyngsborough|12.99,Tyringham|6.63,Upton|13.08,Uxbridge|12.68
        Wakefield|11.74,Wales|14.13,Walpole|12.45,Waltham|10.32,Ware|14.49,Wareham|8.56,Warren|14.74
        Warwick|16.54,Washington|13.82,Watertown|12.2,Wayland|14.83,Webster|11.92,Wellesley|10.17
        Wellfleet|7.1,Wendell|20.5,Wenham|15.99,West Boylston|14.53,West Bridgewater|13.61
        West Brookfield|10.75,West Newbury|10.15,West Springfield|14.02,West Stockbridge|10.34
        West Tisbury|5.21,Westborough|15.93,Westfield|14.93,Westford|13.11,Westhampton|20.35
        Westminster|11.73,Weston|10.88,Westport|7.28,Westwood|12.87,Weymouth|10.12,Whately|13.07
        Whitman|13.29,Wilbraham|17.45,Williamsburg|16.01,Williamstown|14.2,Wilmington|11.41,Winchendon|12.69
        Winchester|11.08,Windsor|9.43,Winthrop|11.14,Woburn|9.15,Worcester|13.28,Worthington|13.93
        Wrentham|11.67,Yarmouth|6.97
        """)

    /// Towns that have offered owner-occupants a residential exemption (it can take thousands off the bill).
    static let maResidentialExemption: Set<String> = ["Boston", "Brookline", "Cambridge", "Chelsea", "Everett", "Malden", "Somerville", "Waltham",
        "Watertown", "Barnstable", "Nantucket", "Truro", "Tisbury", "Provincetown", "Wellfleet", "Aquinnah"]

    /// Florida average total tax rate by county in mills (all property taxes ÷ taxable value, 2024 roll), in Dept. of Revenue
    /// county-number order (11 = Alachua ... 77 = Washington). Source: Florida TaxWatch, "How Florida Counties Compare 2025", from DOR data.
    static let flMillageYear = 2024
    static let flCounties: [(name: String, rate: Double)] = parse("""
        Alachua|20.8095,Baker|14.6367,Bay|12.6726,Bradford|16.5906,Brevard|14.703,Broward|19.8302
        Calhoun|15.321,Charlotte|15.7775,Citrus|15.5066,Clay|15.2732,Collier|9.7402,Columbia|14.7596
        Miami-Dade|18.4427,DeSoto|16.2845,Dixie|19.6363,Duval|17.8913,Escambia|13.6696,Flagler|17.2605
        Franklin|10.6975,Gadsden|16.2562,Gilchrist|15.8371,Glades|18.2563,Gulf|12.6986,Hamilton|16.6089
        Hardee|14.6002,Hendry|17.1788,Hernando|15.1245,Highlands|14.4,Hillsborough|17.986,Holmes|15.2
        Indian River|14.1617,Jackson|14.2248,Jefferson|14.2038,Lafayette|16.255,Lake|15.8028,Lee|14.0306
        Leon|17.7998,Levy|15.5956,Liberty|15.3141,Madison|15.4189,Manatee|14.6499,Marion|16.1672
        Martin|16.7269,Monroe|8.2286,Nassau|16.3817,Okaloosa|12.267,Okeechobee|14.5023,Orange|21.3187
        Osceola|14.8758,Palm Beach|17.4429,Pasco|17.3368,Pinellas|18.0621,Polk|15.3806,Putnam|17.0695
        Saint Johns|13.0651,Saint Lucie|21.5612,Santa Rosa|12.1384,Sarasota|12.7168,Seminole|14.8177
        Sumter|11.1557,Suwannee|15.9178,Taylor|15.2264,Union|16.6983,Volusia|17.6266,Wakulla|13.3851
        Walton|9.2545,Washington|14.5767
        """)
    static let flSchoolMills = 6.0     // about how much of the total goes to schools, which tax a slightly larger value for homesteads

    private static func parse(_ s: String) -> [(name: String, rate: Double)] {
        s.split(whereSeparator: { $0 == "," || $0 == "\n" }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.map { item in
            let parts = item.split(separator: "|")
            return (String(parts[0]), Double(parts[1]) ?? 0)
        }
    }
    private static let maByName: [String: Int] = Dictionary(uniqueKeysWithValues: maTowns.enumerated().map { (key($0.element.name), $0.offset) })
    private static func key(_ s: String) -> String { s.uppercased().filter { $0.isLetter } }

    static func maTown(_ r0: Rec) -> (name: String, rate: Double)? {
        if let id = r0.int("TOWN_ID"), id >= 1, id <= maTowns.count { return maTowns[id - 1] }
        guard let city = r0.str("CITY"), let i = maByName[key(city)] else { return nil }
        return maTowns[i]
    }

    static func estimate(_ s: Summary) -> TaxEstimate? {
        let r0 = s.r0, digits = Regions.digits(r0.str("USE_CODE"))
        if s.commonOnly { return nil }
        switch s.region.id {
        case "MA":
            if digits.hasPrefix("9") { return TaxEstimate(exempt: true) }
            guard digits.hasPrefix("1"), let town = maTown(r0) else { return nil }     // businesses are taxed at a different rate
            let t = s.recs.compactMap { $0.num("TOTAL_VAL") }.filter { $0 > 0 }.map { $0 * town.rate / 1000 }
            guard let lo = t.min(), let hi = t.max() else { return nil }
            var notes = ["\(town.name)’s FY\(maFiscalYear) residential rate is **$\(String(format: "%.2f", town.rate))** per $1,000 of assessed value."]
            if maResidentialExemption.contains(town.name) { notes.append("If the owner lives here, \(town.name)’s residential exemption can lower this a lot.") }
            notes.append("Doesn’t include exemptions (seniors, veterans and others) or a Community Preservation Act surcharge.")
            return TaxEstimate(lo: lo, hi: hi, perUnit: t.count > 1, notes: notes)
        case "FL":
            guard let n = Int(digits), (0...9).contains(n) else { return nil }               // residential use codes only
            guard let co = r0.int("COUNTY"), co >= 11, co <= 77 else { return nil }
            let c = flCounties[co - 11], m = c.rate, rest = max(0, m - flSchoolMills), school = min(m, flSchoolMills)
            let tax: (Double, Double) -> Double = { nsd, sd in (nsd * rest + sd * school) / 1000 }
            let hasTV = s.recs.contains { $0.num("TV_NSD") != nil }
            let t: [Double] = s.recs.compactMap { r in
                if !hasTV { return (r.num("TOTAL_VAL") ?? 0) > 0 ? r.num("TOTAL_VAL")! * m / 1000 : nil }
                guard let nsd = r.num("TV_NSD") else { return nil }
                return tax(max(0, nsd), max(0, r.num("TV_SD") ?? nsd))
            }
            guard let lo = t.min(), let hi = t.max() else { return nil }
            let mills = String(format: "%.2f", m)
            var notes = [hasTV
                ? "From the county’s taxable value (after the current owner’s exemptions) and \(c.name) County’s average tax rate, **\(mills)** mills (\(flMillageYear))."
                : "From the county’s market value before any exemptions and \(c.name) County’s average tax rate, **\(mills)** mills (\(flMillageYear))."]
            var buyer: Double?
            if hasTV, t.count == 1, let jv = r0.num("TOTAL_VAL"), jv > 0 {
                // Florida caps yearly increases for homesteads; the cap resets when the house sells.
                let b = tax(max(0, jv - 50_000), max(0, jv - 25_000))
                if b > t[0] * 1.25, b - t[0] > 500 { buyer = b }
            }
            notes.append("Cities and special districts can make the real bill higher or lower.")
            return TaxEstimate(lo: lo, hi: hi, perUnit: t.count > 1, notes: notes, buyer: buyer)
        default:
            return nil
        }
    }

    /// "≈ $8,240" or "≈ $4,920–6,400"
    static func headline(_ t: TaxEstimate) -> String {
        if t.hi < 1 { return "≈ $0" }
        let lo = Fmt.round10(t.lo), hi = Fmt.round10(t.hi)
        if t.perUnit, lo != hi { return "≈ \(Fmt.moneyFull(lo) ?? "$0")–\(String((Fmt.moneyFull(hi) ?? "$0").dropFirst()))" }
        return "≈ \(Fmt.moneyFull(hi) ?? "$0")"
    }
}
