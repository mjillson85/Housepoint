import Foundation

enum ColorMode: String, CaseIterable, Identifiable {
    case plain, age, value, sold
    var id: String { rawValue }
    var label: String { ["plain": "Photo", "age": "Age", "value": "Value", "sold": "Sold"][rawValue]! }
}

/// How lots are colored on the map: one blue ramp, light to dark (checked as an ordinal ramp against the paper background).
struct ColorScale {
    let mode: ColorMode
    let title: String
    var sub: String
    let colors: [String]           // hex
    let labels: [String]
    let noData: String
    var empty = false
    let get: (LotMetrics) -> Double?
    let cls: (Double) -> Int

    func color(_ m: LotMetrics) -> String? { get(m).map { colors[max(0, min(colors.count - 1, cls($0)))] } }
}

enum MapColors {
    static let ramp = ["#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]

    private static func yrRange(_ a: Int, _ b: Int) -> String { a / 100 == b / 100 ? "\(a)–\(String(String(b).suffix(2)))" : "\(a)–\(b)" }
    private static func bucket(_ v: Double, _ b: [Double]) -> Int { var i = 0; while i < b.count && v >= b[i] { i += 1 }; return i }

    /// Year built; older = darker. Florida's houses are mostly postwar, so its steps are later.
    static func age(_ region: Region) -> ColorScale {
        let b = region.ageBreaks
        let bd = b.map(Double.init)
        return ColorScale(mode: .age, title: "Year built", sub: "", colors: ramp.reversed(),
                          labels: ["Pre-\(b[0])", yrRange(b[0], b[1] - 1), yrRange(b[1], b[2] - 1), yrRange(b[2], b[3] - 1), "\(b[3])+"],
                          noData: "No data", get: { $0.year.map(Double.init) }, cls: { bucket($0, bd) })
    }

    static func ageColor(_ year: Int?, region: Region) -> String? {
        guard let y = year else { return nil }
        let s = age(region)
        return s.colors[s.cls(Double(y))]
    }

    static func median(_ a: [Double]) -> Double? {
        guard !a.isEmpty else { return nil }
        let s = a.sorted(); return s[s.count / 2]
    }

    static func scale(_ mode: ColorMode, lots: [LocalLot], region: Region) -> ColorScale? {
        let built = lots.filter { $0.p.built }.map { $0.metrics }
        var sc: ColorScale
        switch mode {
        case .plain:
            return nil
        case .age:
            sc = age(region)
            if let m = median(built.compactMap { $0.year.map(Double.init) }) { sc.sub = "typical \(Int(m))" }
        case .value:
            let vals = built.compactMap { $0.value }.sorted()
            let nice: (Double) -> Double = { v in let p = pow(10, floor(log10(v)) - 1); return (v / p).rounded() * p }
            var b = vals.count >= 5 ? [0.2, 0.4, 0.6, 0.8].map { nice(vals[Int($0 * Double(vals.count))]) } : [250e3, 500e3, 750e3, 1e6]
            b = b.enumerated().filter { $0.offset == 0 || $0.element > b[$0.offset - 1] }.map { $0.element }   // fifths of the neighborhood
            let k = b.count + 1
            let colors = (0..<k).map { ramp[Int((Double($0) * 4 / Double(k - 1)).rounded())] }
            let labels = ["<" + (Fmt.money(b[0]) ?? "")] + b.dropLast().map { Fmt.money($0) ?? "" } + [(Fmt.money(b.last!) ?? "") + "+"]
            let bb = b
            sc = ColorScale(mode: .value, title: region.id == "FL" ? "County value" : "Assessed value",
                            sub: median(vals).flatMap { Fmt.money($0) }.map { "typical \($0)" } ?? "",
                            colors: colors, labels: labels, noData: "Condo/none", get: { $0.value }, cls: { bucket($0, bb) })
        case .sold:
            let recent = built.filter { ($0.sold ?? 0) >= Fmt.thisYear - 4 }.count
            sc = ColorScale(mode: .sold, title: "Last sold", sub: "\(recent) sold since \(Fmt.thisYear - 4)", colors: ramp,
                            labels: ["Pre-1990", "1990s", "2000s", "2010s", "2020+"], noData: "No sale",
                            get: { $0.sold.map(Double.init) }, cls: { bucket($0, [1990, 2000, 2010, 2020]) })
        }
        sc.empty = !built.contains { sc.get($0) != nil }
        return sc
    }
}
