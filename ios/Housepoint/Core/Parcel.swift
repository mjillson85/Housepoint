import Foundation

/// One assessor record, stored under our (MassGIS-style) field names. Values are kept as text.
struct Rec: Codable, Equatable {
    var v: [String: String] = [:]

    subscript(_ k: String) -> String? { v[k] }

    func str(_ k: String) -> String? {
        guard let s = v[k]?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
        return s
    }
    func num(_ k: String) -> Double? {
        guard let s = str(k), let d = Double(s), d.isFinite else { return nil }
        return d
    }
    func int(_ k: String) -> Int? { num(k).map { Int($0) } }
}

/// A lot on the map: one outline, holding every record on it (condo units stack on one lot).
struct Parcel: Identifiable {
    let key: String
    let region: String
    let ringsLL: [[LL]]
    var records: [Rec]
    var built: Bool
    var id: String { key }
}

enum Parcels {
    /// Text for any JSON value from an ArcGIS response.
    static func text(_ any: Any) -> String? {
        switch any {
        case is NSNull: return nil
        case let s as String: return s
        case let n as NSNumber:
            let d = n.doubleValue
            if d == d.rounded(), abs(d) < 1e15 { return String(Int64(d)) }
            return String(d)
        default: return "\(any)"
        }
    }

    /// Maps a service's attributes onto our names. `rev` maps the service's field name to ours; without it (demo data),
    /// any of our names are taken as they are.
    static func normalize(_ attrs: [String: Any], rev: [String: String]?) -> Rec {
        var r = Rec()
        for (k, val) in attrs {
            let ours: String? = rev.map { $0[k] } ?? (Regions.allFields.contains(k.uppercased()) ? k.uppercased() : nil)
            if let o = ours, let t = text(val) { r.v[o] = t }
        }
        if r.str("LS_DATE") == nil, let y = r.num("SALE_YR"), y > 1800 {
            let m = max(1, min(12, Int(r.num("SALE_MO") ?? 1)))
            r.v["LS_DATE"] = String(format: "%04d%02d01", Int(y), m)
        }
        return r
    }

    /// Stable id for an outline: identical (stacked) condo polygons match, neighbors that share a corner don't.
    static func shapeHash(_ rings: [[LL]]) -> String {
        var h: UInt32 = 5381
        var n = 0
        for r in rings {
            for p in r {
                for b in String(format: "%.6f,%.6f;", p.lon, p.lat).utf8 { h = (h &<< 5) &+ h &+ UInt32(b) }
                n += 1
            }
        }
        return String(h, radix: 36) + "." + String(n)
    }

    static func isBuilt(_ recs: [Rec]) -> Bool {
        recs.contains { r in
            (r.num("RES_AREA") ?? 0) > 0 || (r.num("BLD_AREA") ?? 0) > 0 || (r.num("YEAR_BUILT") ?? 0) > 1600 || (r.num("BLDG_VAL") ?? 0) > 0
                || (r.num("EFF_YEAR") ?? 0) > 1600
                || (Regions.flCondoCode(r.str("USE_CODE")) && ((r.num("BLDGS") ?? 0) > 0 || (r.num("UNITS") ?? 0) > 0))
        }
    }

    /// Turn ArcGIS features (rings in lon/lat) into parcels.
    static func build(_ features: [[String: Any]], region: String, rev: [String: String]?) -> [Parcel] {
        var order: [String] = []
        var byKey: [String: Parcel] = [:]
        for ft in features {
            guard let g = ft["geometry"] as? [String: Any], let raw = g["rings"] as? [[[Double]]], !raw.isEmpty else { continue }
            let rings = raw.map { $0.compactMap { $0.count >= 2 ? LL(lat: $0[1], lon: $0[0]) : nil } }.filter { $0.count >= 3 }
            guard !rings.isEmpty else { continue }
            let rec = normalize(ft["attributes"] as? [String: Any] ?? [:], rev: rev)
            let pt = (rec.str("POLY_TYPE") ?? "").uppercased()
            if !pt.isEmpty, pt != "FEE", pt != "TAX" { continue }      // skip roads, rail and water
            let key = rec.str("LOC_ID") ?? "\(region):\(shapeHash(rings))"
            if byKey[key] == nil { byKey[key] = Parcel(key: key, region: region, ringsLL: rings, records: [], built: false); order.append(key) }
            byKey[key]!.records.append(rec)
        }
        return order.compactMap { k in
            guard var p = byKey[k] else { return nil }
            p.built = isBuilt(p.records)
            return p
        }
    }

    // MARK: demo neighborhood (for the simulator, Apple's reviewers, and trying it anywhere)

    static let demoCenter = LL(lat: 42.0, lon: -71.0)

    static func demo(around c: LL = demoCenter) -> [Parcel] {
        let proj = Proj(c.lat, c.lon)
        var seed: UInt64 = 7
        func rnd() -> Double { seed = (seed * 16807) % 2_147_483_647; return Double(seed) / 2_147_483_647 }
        let styles = ["Colonial", "Cape Cod", "Victorian", "Ranch", "Garrison", "Federal", "Greek Revival", "Bungalow"]
        let streets = ["ELM ST", "MAPLE AVE", "CHESTNUT ST", "PROSPECT HILL RD"]
        var feats: [[String: Any]] = []
        var n = 0
        for row in -2...2 {
            let streetY = Double(row) * 70
            for side in [1.0, -1.0] {
                let y0 = streetY + side * 6, y1 = streetY + side * 34
                var x = -160.0
                while x < 160 {
                    let ring = [P2(x, y0), P2(x + 22, y0), P2(x + 22, y1), P2(x, y1), P2(x, y0)].map { p -> [Double] in
                        let ll = proj.inv(p); return [ll.lon, ll.lat]
                    }
                    let yb = Int(1700 + rnd() * 320)
                    let saleRoll = rnd()
                    let saleYear = 2000 + Int(rnd() * 26), saleMonth = 1 + Int(rnd() * 12)
                    let val = (350 + rnd() * 1100).rounded() * 1000
                    n += 1
                    let num = 10 + (n - 1) * 2
                    var a: [String: Any] = [
                        "LOC_ID": "DEMO_\(n)", "POLY_TYPE": "FEE", "SITE_ADDR": "\(num) \(streets[(row + 2) % 4])", "CITY": "DEMO TOWN", "FY": Fmt.thisYear,
                        "TOTAL_VAL": val, "BLDG_VAL": (val * 0.55).rounded(), "LAND_VAL": (val * 0.45).rounded(),
                        "USE_CODE": rnd() > 0.2 ? "101" : "104", "YEAR_BUILT": min(yb, Fmt.thisYear - 1), "RES_AREA": (1100 + rnd() * 2400).rounded(),
                        "STYLE": styles[Int(rnd() * Double(styles.count)) % styles.count], "STORIES": rnd() > 0.5 ? 2 : 1.5,
                        "NUM_ROOMS": 5 + Int(rnd() * 6), "UNITS": 1, "TOWN_ID": 42,
                    ]
                    if saleRoll > 0.15 {
                        a["LS_DATE"] = String(format: "%04d%02d15", saleYear, saleMonth)
                        a["LS_PRICE"] = (val * (0.45 + rnd() * 0.5) / 1000).rounded() * 1000
                    }
                    feats.append(["geometry": ["rings": [ring]], "attributes": a])
                    x += 22
                }
            }
        }
        return build(feats, region: "MA", rev: nil)
    }
}
