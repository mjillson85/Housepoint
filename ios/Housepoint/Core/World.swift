import Foundation

/// A lot in local meters around the loaded area's center.
final class LocalLot: Identifiable {
    let p: Parcel
    let rings: [[P2]]
    let c: P2
    let bb: BBox
    let proj: Proj
    private var cachedSummary: Summary?
    private var cachedMetrics: LotMetrics?

    init(_ p: Parcel, proj: Proj) {
        self.p = p
        self.proj = proj
        rings = p.ringsLL.map { $0.map { proj.fwd($0) } }
        c = Geo.centroid(rings)
        bb = Geo.bbox(rings)
    }

    var id: String { p.key }
    var summary: Summary {
        if let s = cachedSummary { return s }
        let s = Summaries.summarize(p); cachedSummary = s; return s
    }
    var metrics: LotMetrics {
        if let m = cachedMetrics { return m }
        let m = LotMetrics(summary); cachedMetrics = m; return m
    }
    var centerLL: LL { proj.inv(c) }
    lazy var interior: P2 = Geo.interiorPoint(rings, near: c)
    var interiorLL: LL { proj.inv(interior) }
    var sqft: Double { Geo.area(rings) * 10.7639 }
    var outerRingLL: [LL] { Geo.largestRing(rings).map { proj.inv($0) } }
}

/// Numbers used to color the map and the tags.
struct LotMetrics {
    let year: Int?
    let value: Double?
    let sold: Int?
    init(_ s: Summary) {
        year = s.year ?? s.approxYear
        let v = (s.commonOnly || s.condo) ? nil : s.value      // a condo building isn't comparable to a house
        value = (v ?? 0) > 1000 ? v : nil
        sold = s.marketSale.map { Fmt.year($0.date) }
    }
}

/// The loaded neighborhood.
struct World {
    let center: LL
    let proj: Proj
    let lots: [LocalLot]

    init(parcels: [Parcel], center: LL) {
        self.center = center
        proj = Proj(center.lat, center.lon)
        let pj = proj
        lots = parcels.map { LocalLot($0, proj: pj) }
    }
}

struct Candidate: Identifiable {
    let lot: LocalLot
    var dist: Double          // to where you'd first reach the lot
    var cdist: Double         // to its middle
    var bearing: Double
    var inside = false        // you're standing on it
    var across = 0.0          // how far your aim runs across it, if you're standing on it
    var id: String { lot.id }
}

/// A house you can see from where you stand, found by sweeping rays across the view.
struct Visible {
    let lot: LocalLot
    let rays: Int
    let entry: Double          // meters to the edge of the lot
    let anchor: P2             // a point a few meters into the lot (roughly the house), local meters
    let bearing: Double
}

enum Targeting {
    static let maxRange = 170.0
    static let minRange = 2.0
    static let insideFirst = 12.0
    static let cone: [(Double, Double)] = [(-11, 0.4), (-5.5, 0.8), (0, 1), (5.5, 0.8), (11, 0.4)]

    /// Which lots the phone is pointing at, best first.
    static func candidates(_ world: World, at o: P2, heading: Double) -> [Candidate] {
        let inside = world.lots.filter { $0.p.built && Geo.pointInRings(o, $0.rings) }
        let insideIds = Set(inside.map { $0.id })
        struct Score { var lot: LocalLot; var score: Double; var dist: Double; var center: Bool }
        var scores: [String: Score] = [:]
        var order: [String] = []
        for (off, w) in cone {
            let d = Geo.dir(heading + off)
            var hits: [(Double, LocalLot)] = []
            for L in world.lots where L.p.built && !insideIds.contains(L.id) {
                if Geo.rayBoxT(o, d, L.bb, maxRange) < 0 { continue }
                if let t = Geo.rayEntry(o, d, L.rings, maxRange), t >= minRange { hits.append((t, L)) }
            }
            hits.sort { $0.0 < $1.0 }
            for (i, h) in hits.prefix(2).enumerated() {
                var s = scores[h.1.id] ?? { order.append(h.1.id); return Score(lot: h.1, score: 0, dist: .infinity, center: false) }()
                s.score += w * (i == 0 ? 1 : 0.22)
                s.dist = min(s.dist, h.0)
                if off == 0 && i == 0 { s.center = true }
                scores[h.1.id] = s
            }
        }
        var list = order.compactMap { scores[$0] }.sorted {
            if $0.center != $1.center { return $0.center }
            if $0.score != $1.score { return $0.score > $1.score }
            return $0.dist < $1.dist
        }.map { s -> Candidate in
            let v = s.lot.c - o
            return Candidate(lot: s.lot, dist: s.dist, cdist: len(v), bearing: Geo.bearing(v))
        }
        // Standing on a lot (a condo complex is one big lot): if you're pointing across a good stretch of it, it's
        // probably the one you mean; otherwise keep it within the first few "Not it" taps.
        let d0 = Geo.dir(heading)
        for L in inside {
            let across = Geo.rayEntry(o, d0, L.rings, maxRange) ?? maxRange
            let c = Candidate(lot: L, dist: 0, cdist: len(L.c - o), bearing: Geo.bearing(L.c - o), inside: true, across: across)
            if across >= insideFirst { list.insert(c, at: 0) } else { list.insert(c, at: min(2, list.count)) }
        }
        return list
    }

    /// Lots you can see across a field of view: the first built lot each ray reaches.
    static func visible(_ world: World, at o: P2, heading: Double, half: Double, step: Double = 1.25) -> [Visible] {
        let near = world.lots.filter { $0.p.built && len($0.c - o) < maxRange + 80 && !Geo.pointInRings(o, $0.rings) }
        struct Acc { var lot: LocalLot; var n = 0; var t = Double.infinity; var sum = P2(0, 0); var dsum = P2(0, 0) }
        var hits: [String: Acc] = [:]
        var order: [String] = []
        var a = -half
        while a <= half + 1e-6 {
            let d = Geo.dir(heading + a)
            var best: LocalLot?, bt = Double.infinity
            for L in near {
                let tb = Geo.rayBoxT(o, d, L.bb, maxRange)
                if tb < 0 || tb >= bt { continue }
                if let t = Geo.rayEntry(o, d, L.rings, maxRange), t >= minRange, t < bt { bt = t; best = L }
            }
            if let L = best {
                var e = hits[L.id] ?? { order.append(L.id); return Acc(lot: L) }()
                e.n += 1; e.t = min(e.t, bt)
                e.sum += o + d * (bt + 5)            // a few meters in from the lot line, where the house usually is
                e.dsum += d
                hits[L.id] = e
            }
            a += step
        }
        return order.compactMap { hits[$0] }.map { e in
            Visible(lot: e.lot, rays: e.n, entry: e.t, anchor: e.sum / Double(e.n), bearing: Geo.bearing(e.dsum))
        }
    }
}
