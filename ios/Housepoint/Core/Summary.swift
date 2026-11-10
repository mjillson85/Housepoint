import Foundation

struct Sale {
    let date: Date
    let price: Double?
}

/// Everything the card needs to know about a lot, worked out once.
struct Summary {
    let r0: Rec
    let recs: [Rec]
    let year: Int?
    let sales: [Sale]
    let vals: [Double]
    let addr: String
    let town: String
    let units: Int
    let condo: Bool
    let use: String?
    let fy: Int?
    let region: Region
    let commonOnly: Bool
    let approxYear: Int?
    let updated: Int?
    let multiSale: Bool

    var value: Double? { r0.num("TOTAL_VAL") }
    var marketSale: Sale? { sales.first { ($0.price ?? 0) >= 10_000 } }
    var styleName: String? { r0.str("STYLE").map { Fmt.titleCase($0) } }
}

enum Summaries {
    /// Sale dates come as epoch milliseconds, "YYYYMMDD", or "YYYY-MM-DD".
    static func parseSaleDate(_ s: String?) -> Date? {
        guard let s = s?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
        var cal = Calendar(identifier: .gregorian)
        if let n = Double(s), n > 1e11 {
            cal.timeZone = TimeZone(identifier: "UTC")!
            let c = cal.dateComponents([.year, .month, .day], from: Date(timeIntervalSince1970: n / 1000))
            return Calendar(identifier: .gregorian).date(from: c)
        }
        let d = s.filter { $0.isNumber }
        guard d.count >= 8, let y = Int(d.prefix(4)), let m = Int(d.dropFirst(4).prefix(2)) else { return nil }
        let day = Int(d.dropFirst(6).prefix(2)) ?? 1
        guard y > 1700, y <= Fmt.thisYear + 1, (1...12).contains(m) else { return nil }
        return cal.date(from: DateComponents(year: y, month: m, day: max(1, day)))
    }

    static func summarize(_ p: Parcel) -> Summary {
        let recs = p.records
        let area: (Rec) -> Double = { $0.num("RES_AREA") ?? $0.num("BLD_AREA") ?? 0 }
        let r0 = recs.max(by: { area($0) < area($1) }) ?? recs.first ?? Rec()
        let years = recs.compactMap { $0.int("YEAR_BUILT") }.filter { $0 > 1600 && $0 <= Fmt.thisYear }
        let year = years.min()
        let sales = recs.compactMap { r -> Sale? in
            guard let d = parseSaleDate(r.str("LS_DATE")) else { return nil }
            return Sale(date: d, price: r.num("LS_PRICE"))
        }.sorted { $0.date > $1.date }
        let vals = recs.compactMap { $0.num("TOTAL_VAL") }.filter { $0 > 0 }
        var raw = r0.str("SITE_ADDR") ?? [r0.str("ADDR_NUM"), r0.str("FULL_STR")].compactMap { $0 }.joined(separator: " ")
        if raw.isEmpty { raw = r0.str("LOCATION") ?? "" }
        if recs.count > 1 {
            raw = raw.replacingOccurrences(of: #"\s+(UNIT|APT|STE|SUITE|#)\s*[\w-]*$"#, with: "", options: [.regularExpression, .caseInsensitive])
                .replacingOccurrences(of: #"\s*#\s*[\w-]+$"#, with: "", options: .regularExpression)
        }
        let addr = Fmt.titleCase(raw)
        let region = Regions.byId(p.region)
        let eff = recs.compactMap { $0.int("EFF_YEAR") }.filter { $0 > 1600 && $0 <= Fmt.thisYear }
        let unitsListed = r0.int("UNITS").map { max(1, $0) } ?? 1
        // Florida: some counties publish only the condo's common-area lot (no value, no units) and keep unit records elsewhere.
        let commonOnly = region.id == "FL" && Regions.flCondoCode(r0.str("USE_CODE")) && !vals.contains { $0 > 1000 }
        let multi = recs.contains { r in
            guard let m = r.str("MULTI_SALE") else { return false }
            return !["N", "0"].contains(m.uppercased())
        }
        let maxEff = eff.max()
        return Summary(
            r0: r0, recs: recs, year: year, sales: sales, vals: vals,
            addr: addr.isEmpty ? "Address not listed" : addr, town: Fmt.titleCase(r0.str("CITY")),
            units: recs.count > 1 ? recs.count : unitsListed, condo: recs.count > 1, use: region.useLabel(r0.str("USE_CODE")),
            fy: r0.int("FY"), region: region, commonOnly: commonOnly,
            approxYear: year == nil ? maxEff : nil,
            updated: (maxEff != nil && year != nil && maxEff! - year! >= 10) ? maxEff : nil,
            multiSale: multi)
    }
}
