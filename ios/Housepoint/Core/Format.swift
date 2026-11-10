import Foundation

/// Text formatting shared by the card, tags, map legend and share image.
enum Fmt {
    static let thisYear = Calendar(identifier: .gregorian).component(.year, from: Date())

    private static let grouping: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_US")
        f.maximumFractionDigits = 0
        return f
    }()

    static func grouped(_ n: Double) -> String {
        grouping.string(from: NSNumber(value: n.rounded())) ?? String(Int(n.rounded()))
    }

    /// $812k, $1.25M, $12.5M
    static func money(_ v: Double?) -> String? {
        guard let n = v, n > 0 else { return nil }
        if n >= 1e6 {
            var s = String(format: n >= 1e7 ? "%.1f" : "%.2f", n / 1e6)
            while s.contains(".") && (s.hasSuffix("0") || s.hasSuffix(".")) { s.removeLast() }
            return "$" + s + "M"
        }
        if n >= 1e3 { return "$" + grouped(n / 1e3) + "k" }
        return "$" + grouped(n)
    }

    /// $1,200,000
    static func moneyFull(_ v: Double?) -> String? {
        guard let n = v, n > 0 else { return nil }
        return "$" + grouped(n)
    }

    static func round10(_ v: Double) -> Double { (v / 10).rounded() * 10 }

    /// "22 CHESTNUT ST" -> "22 Chestnut St", "5TH AVE" -> "5th Ave"
    static func titleCase(_ s: String?) -> String {
        let lower = (s ?? "").lowercased().split(whereSeparator: { $0 == " " || $0 == "\t" || $0 == "\n" }).joined(separator: " ")
        var out = ""
        var capNext = true
        for ch in lower {
            if capNext, ch.isLetter { out += ch.uppercased(); capNext = false; continue }
            out.append(ch)
            capNext = ch == " " || ch == "-" || ch == "/"
        }
        // ordinal suffixes: 1St -> 1st
        let words = out.split(separator: " ", omittingEmptySubsequences: false).map { w -> String in
            let str = String(w)
            for suf in ["St", "Nd", "Rd", "Th"] where str.hasSuffix(suf) {
                let head = str.dropLast(2)
                if !head.isEmpty, head.allSatisfy({ $0.isNumber }) { return String(head) + suf.lowercased() }
            }
            return str
        }
        return words.joined(separator: " ").trimmingCharacters(in: .whitespaces)
    }

    static func compass8(_ deg: Double) -> String {
        let names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        return names[Int((Geo.norm(deg) / 45).rounded()) % 8]
    }

    static let milestones: [(Int, String)] = [
        (1776, "the United States"), (1814, "the Star-Spangled Banner"), (1844, "the telegraph"), (1861, "the Civil War"),
        (1876, "the telephone"), (1879, "the light bulb"), (1903, "the airplane"), (1908, "the Model T"), (1911, "the Titanic"),
        (1928, "sliced bread"), (1955, "Disneyland"), (1969, "the moon landing"), (1983, "the cell phone"), (1991, "the web"), (2007, "the iPhone"),
    ]

    static func olderThan(_ year: Int?) -> String? {
        guard let y = year, let m = milestones.first(where: { y < $0.0 }) else { return nil }
        return "Older than \(m.1)"
    }

    static func era(_ year: Int?) -> String? {
        guard let y = year else { return nil }
        switch y {
        case ..<1776: return "Colonial era"
        case ..<1830: return "Federal era"
        case ..<1870: return "Greek Revival & Italianate era"
        case ..<1915: return "Victorian era"
        case ..<1942: return "Early 20th century"
        case ..<1966: return "Postwar"
        case ..<2000: return "Late 20th century"
        default: return "21st century"
        }
    }

    private static let monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    static func month(_ d: Date) -> String {
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month], from: d)
        return "\(monthNames[(c.month ?? 1) - 1]) \(c.year ?? 0)"
    }
    static func year(_ d: Date) -> Int { Calendar(identifier: .gregorian).component(.year, from: d) }

    /// Lot size: "6,460 ft²" or "1.2 ac"
    static func lot(sqft: Double) -> String {
        let acres = sqft / 43560
        if acres >= 0.5 { return String(format: acres >= 10 ? "%.0f ac" : "%.1f ac", acres) }
        let step: Double = sqft < 10000 ? 10 : 100
        return grouped((sqft / step).rounded() * step) + " ft²"
    }
}
