import Foundation

enum NetError: LocalizedError {
    case http(Int)
    case service(String)
    case badResponse
    var errorDescription: String? {
        switch self {
        case .http(let c): return "HTTP \(c)"
        case .service(let m): return m
        case .badResponse: return "Unexpected response"
        }
    }
}

enum Net {
    static let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 20
        c.requestCachePolicy = .useProtocolCachePolicy
        return URLSession(configuration: c)
    }()

    static func form(_ params: [String: String]) -> Data {
        var comps = URLComponents()
        comps.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        // URLComponents leaves "+" alone; a form body needs it escaped.
        let q = comps.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B") ?? ""
        return Data(q.utf8)
    }

    /// GET (or POST a form) and parse a JSON object; ArcGIS errors come back as `{ "error": {...} }` with HTTP 200.
    static func json(_ urlString: String, query: [String: String] = [:], post: [String: String]? = nil, timeout: TimeInterval = 20) async throws -> [String: Any] {
        guard var comps = URLComponents(string: urlString) else { throw NetError.badResponse }
        if !query.isEmpty { comps.queryItems = (comps.queryItems ?? []) + query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        guard let url = comps.url else { throw NetError.badResponse }
        var req = URLRequest(url: url, timeoutInterval: timeout)
        if let post {
            req.httpMethod = "POST"
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            req.httpBody = form(post)
        }
        let (data, resp) = try await session.data(for: req)
        if let h = resp as? HTTPURLResponse, !(200..<300).contains(h.statusCode) { throw NetError.http(h.statusCode) }
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw NetError.badResponse }
        if let err = obj["error"] as? [String: Any] { throw NetError.service(err["message"] as? String ?? "Service error") }
        return obj
    }
}
