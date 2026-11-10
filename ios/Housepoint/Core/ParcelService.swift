import Foundation

/// Finds each state's parcel layer, then loads lots around a point and searches addresses.
@MainActor
final class ParcelService {
    struct Layer {
        let url: String
        let rev: [String: String]       // service field -> our name
        let canon: [String: String]     // our name -> service field
        let outFields: [String]
        let oid: String?
        let pageSize: Int
    }

    private var layers: [String: Layer] = [:]
    private var pending: [String: Task<Layer, Error>] = [:]

    func layer(for region: Region) async throws -> Layer {
        if let l = layers[region.id] { return l }
        if let t = pending[region.id] { return try await t.value }
        let t = Task { () async throws -> Layer in
            for u in region.services {
                if let l = try? await self.tryLayer(region, u) { return l }
            }
            for id in region.items {      // public ArcGIS Online items: look up their current service address
                if let it = try? await Net.json("https://www.arcgis.com/sharing/rest/content/items/\(id)", query: ["f": "json"]),
                   let u = it["url"] as? String, let l = try? await self.tryLayer(region, u) { return l }
            }
            if let res = try? await Net.json("https://www.arcgis.com/sharing/rest/search", query: ["q": region.discover, "num": "20", "f": "json"]),
               let results = res["results"] as? [[String: Any]] {
                for it in results.prefix(10) {
                    if let u = it["url"] as? String, let l = try? await self.tryLayer(region, u) { return l }
                }
            }
            throw NetError.service("Can’t reach the \(region.name) property data right now.")
        }
        pending[region.id] = t
        do {
            let l = try await t.value
            layers[region.id] = l
            pending[region.id] = nil
            return l
        } catch {
            pending[region.id] = nil
            throw error
        }
    }

    private func tryLayer(_ region: Region, _ raw: String) async throws -> Layer? {
        let url = raw.replacingOccurrences(of: #"/+$"#, with: "", options: .regularExpression)
        var layerUrls: [String]
        if url.range(of: #"/(FeatureServer|MapServer)/\d+$"#, options: [.regularExpression, .caseInsensitive]) != nil {
            layerUrls = [url]
        } else {
            let meta = try await Net.json(url, query: ["f": "json"])
            let ls = (meta["layers"] as? [[String: Any]] ?? []).filter { l in
                guard let g = l["geometryType"] as? String else { return true }
                return g.range(of: "Polygon", options: .caseInsensitive) != nil
            }
            layerUrls = (ls.isEmpty ? [["id": 0]] : ls).compactMap { l in (l["id"] as? Int).map { "\(url)/\($0)" } }
        }
        for lurl in layerUrls.prefix(6) {
            let lm = try await Net.json(lurl, query: ["f": "json"])
            let names = (lm["fields"] as? [[String: Any]] ?? []).compactMap { $0["name"] as? String }
            var upper: [String: String] = [:]
            for n in names { upper[n.uppercased()] = n }
            let found = region.detect.filter { upper[$0] != nil }.count
            if found < min(2, region.detect.count) { continue }
            var rev: [String: String] = [:], canon: [String: String] = [:]
            for (ours, cands) in region.fields {
                if let hit = cands.lazy.compactMap({ upper[$0.uppercased()] }).first { rev[hit] = ours; canon[ours] = hit }
            }
            let maxRec = lm["maxRecordCount"] as? Int ?? 1000
            return Layer(url: lurl, rev: rev, canon: canon, outFields: Array(rev.keys).sorted(), oid: lm["objectIdField"] as? String, pageSize: min(2000, maxRec))
        }
        return nil
    }

    /// Lots within `radius` meters of a point. Dense areas (condos) can take more than one page.
    func queryNear(lat: Double, lon: Double, radius: Double = 220) async throws -> [Parcel] {
        guard let region = Regions.at(lat, lon) else { return [] }
        let l = try await layer(for: region)
        var feats: [[String: Any]] = []
        var offset = 0
        for _ in 0..<8 {
            var p: [String: String] = [
                "geometry": "\(lon),\(lat)", "geometryType": "esriGeometryPoint", "inSR": "4326", "spatialRel": "esriSpatialRelIntersects",
                "distance": String(Int(radius)), "units": "esriSRUnit_Meter", "outFields": l.outFields.joined(separator: ","),
                "returnGeometry": "true", "outSR": "4326", "geometryPrecision": "7",
                "resultOffset": String(offset), "resultRecordCount": String(l.pageSize), "f": "json",
            ]
            if let oid = l.oid { p["orderByFields"] = oid }
            let j = try await Net.json(l.url + "/query", post: p)
            let got = j["features"] as? [[String: Any]] ?? []
            feats += got
            if !(j["exceededTransferLimit"] as? Bool ?? false) || got.isEmpty { break }
            offset += got.count
        }
        return Parcels.build(feats, region: region.id, rev: l.rev)
    }

    struct Found { let ll: LL; let key: String }

    static let streetAbbr = ["STREET": "ST", "AVENUE": "AVE", "ROAD": "RD", "LANE": "LN", "DRIVE": "DR", "COURT": "CT", "PLACE": "PL",
        "TERRACE": "TER", "CIRCLE": "CIR", "BOULEVARD": "BLVD", "PARKWAY": "PKWY", "SQUARE": "SQ", "HIGHWAY": "HWY", "WAY": "WAY"]
    static let stateWords: Set<String> = ["FL", "FLA", "FLORIDA", "MA", "MASS", "MASSACHUSETTS"]

    /// "22 Chestnut Street, Salem" -> the lot's middle.
    func search(_ text: String, near: LL?) async throws -> Found? {
        let parts = text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let cleaned = (parts.first ?? "").uppercased().map { $0.isLetter || $0.isNumber ? $0 : " " }
        let addr = String(cleaned).split(separator: " ").map { Self.streetAbbr[String($0)] ?? String($0) }.joined(separator: " ")
        guard !addr.isEmpty else { return nil }
        let rest = parts.dropFirst()
        let town = rest.first { !Self.stateWords.contains($0.uppercased()) }
        let said = rest.first { Self.stateWords.contains($0.uppercased()) }?.uppercased() ?? ""
        var order: [Region] = []
        if said.hasPrefix("F") { order.append(Regions.fl) } else if said.hasPrefix("M") { order.append(Regions.ma) }
        if let n = near, let r = Regions.at(n.lat, n.lon) { order.append(r) }
        order += [Regions.ma, Regions.fl]
        var seen = Set<String>()
        for r in order where seen.insert(r.id).inserted {
            if let f = try? await search(in: r, addr: addr, town: town) { return f }
        }
        return nil
    }

    private func search(in region: Region, addr: String, town: String?) async throws -> Found? {
        let l = try await layer(for: region)
        guard let a = l.canon["SITE_ADDR"] else { return nil }
        let sq: (String) -> String = { $0.replacingOccurrences(of: "'", with: "''") }
        var tries: [String] = []
        if let town, let c = l.canon["CITY"] {
            let t = town.uppercased().filter { $0.isLetter || $0.isNumber || " .-".contains($0) }
            tries.append("UPPER(\(a)) LIKE '\(sq(addr))%' AND UPPER(\(c)) LIKE '\(sq(t))%'")
        }
        tries.append("UPPER(\(a)) LIKE '\(sq(addr))%'")
        for w in tries {
            let j = try await Net.json(l.url + "/query", query: ["where": w, "outFields": l.outFields.joined(separator: ","), "returnGeometry": "true",
                                                                "outSR": "4326", "geometryPrecision": "7", "resultRecordCount": "5", "f": "json"], timeout: 12)
            let ps = Parcels.build(j["features"] as? [[String: Any]] ?? [], region: region.id, rev: l.rev)
            if let p = ps.first, let first = p.ringsLL.first?.first {
                let proj = Proj(first.lat, first.lon)
                let rings = p.ringsLL.map { $0.map { proj.fwd($0) } }
                return Found(ll: proj.inv(Geo.centroid(rings)), key: p.key)
            }
        }
        return nil
    }
}
