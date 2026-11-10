import Foundation

/// FEMA flood zone (National Flood Hazard Layer) and USGS ground elevation for a lot.
enum FloodRisk: String { case high, moderate, low, unknown, water }

struct FloodClass: Equatable {
    var rank: Double
    var badge: String
    var risk: FloodRisk
    var coastal = false
    var levee = false
    var shaded: String? = nil      // "500" (0.2% annual chance) or "x" (other shaded zone X)
}

struct FloodResult {
    var none = false
    var here: FloodClass?
    var top: FloodClass?
    var partial = false
    var exact = true
    var bfe: Double?
}

struct FloodView {
    let style: FloodRisk?
    let badge: String
    let small: String
    let title: String
    let lines: [String]
}

enum Flood {
    static let sources = [
        "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",                                              // FEMA
        "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0",   // Esri's copy
    ]
    static let epqs = "https://epqs.nationalmap.gov/v1/json"

    /// `a` has upper-case field names.
    static func classify(_ a: [String: String]) -> FloodClass? {
        let z = (a["FLD_ZONE"] ?? "").trimmingCharacters(in: .whitespaces).uppercased()
        let st = (a["ZONE_SUBTY"] ?? "").uppercased()
        if z.isEmpty || z == "AREA NOT INCLUDED" { return nil }
        if z == "OPEN WATER" { return FloodClass(rank: 0, badge: "Water", risk: .water) }
        if z.hasPrefix("V") { return FloodClass(rank: 5, badge: z, risk: .high, coastal: true) }
        if z.hasPrefix("A") || (a["SFHA_TF"] ?? "").uppercased() == "T" { return FloodClass(rank: 4, badge: String(z.prefix(4)), risk: .high) }
        if z == "X" && st.contains("LEVEE") { return FloodClass(rank: 3, badge: "X", risk: .moderate, levee: true) }
        let both = z + " " + st
        if both.range(of: #"0\.2 ?(PCT|PERCENT)|500"#, options: .regularExpression) != nil || z == "B" {
            return FloodClass(rank: 3, badge: "X", risk: .moderate, shaded: "500")
        }
        if z == "X" && !st.isEmpty && !st.contains("MINIMAL") { return FloodClass(rank: 3, badge: "X", risk: .moderate, shaded: "x") }
        if z == "D" { return FloodClass(rank: 2, badge: "D", risk: .unknown) }
        if z == "X" || z == "C" { return FloodClass(rank: 1, badge: "X", risk: .low) }
        return FloodClass(rank: 1.5, badge: String(z.prefix(4)), risk: .unknown)
    }

    typealias Zone = (a: [String: String], c: FloodClass)

    /// Zones on land win over open water: a waterfront lot's flood risk is about the land, not the harbor.
    static func classifyAll(_ rows: [[String: String]]) -> [Zone] {
        let zs: [Zone] = rows.compactMap { a in classify(a).map { (a, $0) } }
        let land = zs.filter { $0.c.risk != .water }
        return land.isEmpty ? zs : land
    }
    static func riskiest(_ zs: [Zone]) -> Zone? { zs.max { $0.c.rank < $1.c.rank } }

    /// Works out the result from the zones touching the lot and (if they differ) the zones at its middle.
    static func result(lotZones: [[String: String]], middle: [[String: String]]?, exact: Bool) -> FloodResult {
        let zones = classifyAll(lotZones)
        guard let top = riskiest(zones) else { return FloodResult(none: true) }
        var here = top
        if let m = middle, let mid = riskiest(classifyAll(m)), mid.c.risk != .water { here = mid }
        // Base flood elevation, only when it's in the same datum as the USGS ground elevation (NAVD88).
        let bfes = zones.filter { $0.c.risk == .high && ($0.a["V_DATUM"] ?? "").uppercased().contains("NAVD") }
            .compactMap { Double($0.a["STATIC_BFE"] ?? "") }.filter { $0 > -9000 && $0 < 2000 }
        return FloodResult(here: here.c, top: top.c, partial: top.c.rank > here.c.rank, exact: exact, bfe: bfes.max())
    }

    static func needsMiddle(_ lotZones: [[String: String]]) -> Bool { Set(classifyAll(lotZones).map { $0.c.rank }).count > 1 }

    // MARK: network

    private static var preferred = 0

    static func query(geometry: String, type: String) async throws -> [[String: String]] {
        let body = ["geometry": geometry, "geometryType": type, "inSR": "4326", "spatialRel": "esriSpatialRelIntersects",
                    "outFields": "*", "returnGeometry": "false", "f": "json"]
        var order = [preferred] + Array(sources.indices)
        var seen = Set<Int>(); order = order.filter { seen.insert($0).inserted }
        var lastError: Error = NetError.badResponse
        for i in order {
            do {
                let j = try await Net.json(sources[i] + "/query", post: body, timeout: 12)
                preferred = i
                return (j["features"] as? [[String: Any]] ?? []).map { ft in
                    var out: [String: String] = [:]
                    for (k, v) in ft["attributes"] as? [String: Any] ?? [:] { if let t = Parcels.text(v) { out[k.uppercased()] = t } }
                    return out
                }
            } catch { lastError = error }
        }
        throw lastError
    }

    static func lookup(_ lot: LocalLot) async throws -> FloodResult {
        let rings = lot.p.ringsLL
        let nv = rings.reduce(0) { $0 + $1.count }
        var exact = true
        let zones: [[String: String]]
        if nv <= 400 {
            let coords = rings.map { r in r.map { [($0.lon * 1e7).rounded() / 1e7, ($0.lat * 1e7).rounded() / 1e7] } }
            let g = try JSONSerialization.data(withJSONObject: ["rings": coords, "spatialReference": ["wkid": 4326]])
            zones = try await query(geometry: String(decoding: g, as: UTF8.self), type: "esriGeometryPolygon")
        } else {      // very detailed outline: use its bounding box, which can catch zones the lot itself doesn't touch
            exact = false
            let lats = rings.flatMap { $0.map(\.lat) }, lons = rings.flatMap { $0.map(\.lon) }
            zones = try await query(geometry: "\(lons.min()!),\(lats.min()!),\(lons.max()!),\(lats.max()!)", type: "esriGeometryEnvelope")
        }
        var middle: [[String: String]]?
        if needsMiddle(zones) {
            let ll = lot.interiorLL
            middle = try? await query(geometry: String(format: "%.7f,%.7f", ll.lon, ll.lat), type: "esriGeometryPoint")
        }
        return result(lotZones: zones, middle: middle, exact: exact)
    }

    static func elevation(_ lot: LocalLot) async throws -> Double? {
        let ll = lot.interiorLL
        let j = try await Net.json(epqs, query: ["x": String(format: "%.6f", ll.lon), "y": String(format: "%.6f", ll.lat), "wkid": "4326",
                                                "units": "Feet", "includeDate": "false"], timeout: 10)
        guard let v = j["value"].flatMap({ Parcels.text($0) }).flatMap({ Double($0) }), v > -1000, v < 21000 else { return nil }   // -1000000 = no data
        return v
    }

    // MARK: wording

    static func view(_ fl: FloodResult?, elevation el: Double?) -> FloodView {
        var lines: [String] = []
        var style: FloodRisk? = nil
        var badge = "—", small = "zone", title: String
        if let fl, !fl.none, let c = fl.here {
            badge = c.badge; style = c.risk == .water ? nil : c.risk
            if c.risk == .water { small = "" }
            switch c.risk {
            case .high: title = c.coastal ? "High flood risk · coastal" : "High flood risk"
            case .moderate: title = c.levee ? "Moderate risk · behind a levee" : "Moderate flood risk"
            case .low: title = "Minimal flood risk"
            case .unknown: title = "Flood risk not mapped"
            case .water: title = "Open water"
            }
            if c.risk == .high { lines.append("Flood insurance is usually required with a mortgage") }
            if c.shaded == "500" { lines.append("In the 500-year floodplain") } else if c.shaded != nil { lines.append("Shallow or local flooding possible") }
            if fl.partial, let top = fl.top {
                if top.risk == .high && c.risk != .high { title = fl.exact ? "Next to a high-risk flood zone" : "Near a high-risk flood zone"; style = .moderate }
                let name = top.shaded != nil ? "X (shaded)" : top.badge
                lines.append(fl.exact ? "Part of the lot is in zone \(name)" : "Zone \(name) is nearby")
            }
        } else if let fl, fl.none {
            title = "No FEMA flood map for this spot"; small = ""
        } else {
            title = "Flood map didn’t load"; badge = "?"; small = ""
        }
        if let el {
            lines.append(el >= 0 ? "Ground ≈ \(Fmt.grouped(el)) ft above sea level (middle of the lot)" : "Ground ≈ \(Fmt.grouped(-el)) ft below sea level (middle of the lot)")
        }
        if let b = fl?.bfe { lines.append("100-year flood level ≈ \(Fmt.grouped(b)) ft above sea level") }
        return FloodView(style: style, badge: badge, small: small, title: title, lines: lines)
    }

    /// Made-up but stable values for the demo neighborhood.
    static func demo(_ lot: LocalLot) -> (FloodResult, Double) {
        var h: Int = 7
        for b in lot.id.utf8 { h = (h &* 31 &+ Int(b)) & 0x7fff_ffff }
        let r = h % 100, elev = Double(6 + h % 120)
        let a: [String: String] = r < 14 ? ["FLD_ZONE": "AE"] : r < 26 ? ["FLD_ZONE": "X", "ZONE_SUBTY": "0.2 PCT ANNUAL CHANCE FLOOD HAZARD"]
            : ["FLD_ZONE": "X", "ZONE_SUBTY": "AREA OF MINIMAL FLOOD HAZARD"]
        let c = classify(a)!
        return (FloodResult(here: c, top: c, bfe: c.risk == .high ? elev + 3 : nil), elev)
    }
}
