import Foundation

typealias P2 = SIMD2<Double>

/// A latitude/longitude pair (WGS84 degrees).
struct LL: Hashable, Codable {
    var lat: Double
    var lon: Double
}

/// Flat-earth meters around an origin: x = east, y = north. Accurate to well under a meter across a neighborhood.
struct Proj {
    let lat0: Double, lon0: Double, kx: Double, ky: Double
    init(_ lat0: Double, _ lon0: Double) {
        self.lat0 = lat0; self.lon0 = lon0
        kx = cos(lat0 * .pi / 180) * 111_320
        ky = 110_540
    }
    func fwd(_ lat: Double, _ lon: Double) -> P2 { P2((lon - lon0) * kx, (lat - lat0) * ky) }
    func fwd(_ ll: LL) -> P2 { fwd(ll.lat, ll.lon) }
    func inv(_ p: P2) -> LL { LL(lat: lat0 + p.y / ky, lon: lon0 + p.x / kx) }
}

struct BBox {
    var minx: Double, miny: Double, maxx: Double, maxy: Double
    var center: P2 { P2((minx + maxx) / 2, (miny + maxy) / 2) }
    var width: Double { maxx - minx }
    var height: Double { maxy - miny }
}

enum Geo {
    static func rad(_ d: Double) -> Double { d * .pi / 180 }
    static func deg(_ r: Double) -> Double { r * 180 / .pi }
    static func norm(_ d: Double) -> Double {
        let x = d.truncatingRemainder(dividingBy: 360)
        return x < 0 ? x + 360 : x
    }
    /// Signed difference a - b in degrees, in -180..<180.
    static func angDiff(_ a: Double, _ b: Double) -> Double { norm(a - b + 180) - 180 }
    /// Compass bearing (degrees clockwise from north) of a direction vector in local meters.
    static func bearing(_ v: P2) -> Double { norm(deg(atan2(v.x, v.y))) }
    static func dir(_ bearing: Double) -> P2 { P2(sin(rad(bearing)), cos(rad(bearing))) }

    static func pointInRings(_ p: P2, _ rings: [[P2]]) -> Bool {
        var inside = false
        for r in rings where r.count > 2 {
            var j = r.count - 1
            for i in 0..<r.count {
                let a = r[i], b = r[j]
                if (a.y > p.y) != (b.y > p.y), p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x { inside.toggle() }
                j = i
            }
        }
        return inside
    }

    /// Distance along the ray o + t·d to the nearest edge of the rings, or nil.
    static func rayEntry(_ o: P2, _ d: P2, _ rings: [[P2]], _ maxT: Double) -> Double? {
        var best: Double?
        for r in rings where r.count > 1 {
            var j = r.count - 1
            for i in 0..<r.count {
                let a = r[j], e = r[i] - a
                let den = d.x * e.y - d.y * e.x
                if abs(den) > 1e-9 {
                    let w = a - o
                    let t = (w.x * e.y - w.y * e.x) / den
                    let u = (w.x * d.y - w.y * d.x) / den
                    if t >= 0, t <= maxT, u >= 0, u <= 1, best.map({ t < $0 }) ?? true { best = t }
                }
                j = i
            }
        }
        return best
    }

    /// Where the ray first enters a bounding box, or -1 if it misses (cheap test before the exact one).
    static func rayBoxT(_ o: P2, _ d: P2, _ b: BBox, _ maxT: Double) -> Double {
        var t0 = 0.0, t1 = maxT
        if abs(d.x) < 1e-12 { if o.x < b.minx || o.x > b.maxx { return -1 } } else {
            var ta = (b.minx - o.x) / d.x, tb = (b.maxx - o.x) / d.x
            if ta > tb { swap(&ta, &tb) }
            t0 = max(t0, ta); t1 = min(t1, tb); if t0 > t1 { return -1 }
        }
        if abs(d.y) < 1e-12 { if o.y < b.miny || o.y > b.maxy { return -1 } } else {
            var ta = (b.miny - o.y) / d.y, tb = (b.maxy - o.y) / d.y
            if ta > tb { swap(&ta, &tb) }
            t0 = max(t0, ta); t1 = min(t1, tb); if t0 > t1 { return -1 }
        }
        return t0
    }

    static func ringArea(_ r: [P2]) -> Double {
        guard r.count > 2 else { return 0 }
        var a = 0.0, j = r.count - 1
        for i in 0..<r.count { a += (r[j].x + r[i].x) * (r[j].y - r[i].y); j = i }
        return a / 2
    }

    static func largestRing(_ rings: [[P2]]) -> [P2] {
        rings.max(by: { abs(ringArea($0)) < abs(ringArea($1)) }) ?? []
    }

    /// Area-weighted centroid of the largest ring.
    static func centroid(_ rings: [[P2]]) -> P2 {
        let big = largestRing(rings)
        guard big.count > 2 else { return big.first ?? P2(0, 0) }
        var cx = 0.0, cy = 0.0, a6 = 0.0, j = big.count - 1
        for i in 0..<big.count {
            let f = big[j].x * big[i].y - big[i].x * big[j].y
            cx += (big[j].x + big[i].x) * f; cy += (big[j].y + big[i].y) * f; a6 += f * 3
            j = i
        }
        return a6 == 0 ? big[0] : P2(cx / a6, cy / a6)
    }

    static func bbox(_ rings: [[P2]]) -> BBox {
        var b = BBox(minx: .infinity, miny: .infinity, maxx: -.infinity, maxy: -.infinity)
        for r in rings { for p in r { b.minx = min(b.minx, p.x); b.maxx = max(b.maxx, p.x); b.miny = min(b.miny, p.y); b.maxy = max(b.maxy, p.y) } }
        return b
    }

    static func area(_ rings: [[P2]]) -> Double { abs(rings.reduce(0) { $0 + ringArea($1) }) }

    /// A point inside the lot near its middle (the centroid of an L-shaped or flag lot can fall outside it).
    static func interiorPoint(_ rings: [[P2]], near c: P2) -> P2 {
        if pointInRings(c, rings) { return c }
        let b = bbox(rings)
        var best: P2?, bd = Double.infinity
        for i in 1..<12 {
            for j in 1..<12 {
                let p = P2(b.minx + b.width * Double(i) / 12, b.miny + b.height * Double(j) / 12)
                let d = simd_distance_d(p, c)
                if d < bd, pointInRings(p, rings) { bd = d; best = p }
            }
        }
        return best ?? c
    }
}

@inline(__always) func simd_distance_d(_ a: P2, _ b: P2) -> Double { ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)).squareRoot() }
@inline(__always) func len(_ a: P2) -> Double { (a.x * a.x + a.y * a.y).squareRoot() }
