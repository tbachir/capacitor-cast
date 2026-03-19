import Foundation

@objc public class Cast: NSObject {
    @objc public func echo(_ value: String) -> String {
        print(value)
        return value
    }
}
