// Draws the app icon and writes App/Assets.xcassets/AppIcon.appiconset.
// Usage (from the macos folder): swift scripts/make-icon.swift
import AppKit
import SwiftUI

let output = URL(fileURLWithPath: "App/Assets.xcassets/AppIcon.appiconset", isDirectory: true)

/// macOS icon grid: an 824-point rounded square centred on a 1024-point canvas, transparent outside.
/// Cool morning sky into deep blue, a soft highlight like Liquid Glass, and a white snowflake with airflow below.
struct Icon: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 185, style: .continuous)
                .fill(LinearGradient(colors: [Color(red: 0.42, green: 0.80, blue: 1.00), Color(red: 0.05, green: 0.42, blue: 0.93)],
                                     startPoint: .top, endPoint: .bottom))
                .overlay(
                    RoundedRectangle(cornerRadius: 185, style: .continuous)
                        .fill(LinearGradient(colors: [.white.opacity(0.35), .white.opacity(0)], startPoint: .top, endPoint: .center))
                        .padding(6)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 185, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.35), lineWidth: 5)
                )
                .frame(width: 824, height: 824)
                .shadow(color: .black.opacity(0.28), radius: 14, y: 10)
            VStack(spacing: -10) {
                Image(systemName: "snowflake")
                    .font(.system(size: 380, weight: .semibold))
                Image(systemName: "wind")
                    .font(.system(size: 150, weight: .bold))
                    .opacity(0.85)
            }
            .foregroundStyle(.white)
            .shadow(color: Color(red: 0.0, green: 0.18, blue: 0.5).opacity(0.4), radius: 12, y: 8)
            .offset(y: 10)
        }
        .frame(width: 1024, height: 1024)
    }
}

@MainActor
func writeIcons() throws {
    let renderer = ImageRenderer(content: Icon())
    renderer.scale = 1
    guard let image = renderer.cgImage else {
        throw CocoaError(.fileWriteUnknown)
    }
    try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
    var images: [[String: String]] = []
    for points in [16, 32, 128, 256, 512] {
        for scale in [1, 2] {
            let pixels = points * scale
            let name = "icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"
            try png(image, size: pixels).write(to: output.appending(path: name))
            images.append(["idiom": "mac", "size": "\(points)x\(points)", "scale": "\(scale)x", "filename": name])
        }
    }
    let contents: [String: Any] = ["images": images, "info": ["author": "xcode", "version": 1]]
    let json = try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
    try json.write(to: output.appending(path: "Contents.json"))
}

func png(_ image: CGImage, size: Int) throws -> Data {
    guard let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        throw CocoaError(.fileWriteUnknown)
    }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
    guard let scaled = context.makeImage(), let data = NSBitmapImageRep(cgImage: scaled).representation(using: .png, properties: [:]) else {
        throw CocoaError(.fileWriteUnknown)
    }
    return data
}

try MainActor.assumeIsolated {
    try writeIcons()
}
print("wrote \(output.path)")
