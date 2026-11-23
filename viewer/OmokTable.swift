import AppKit
import WebKit

@MainActor final class TableApplication: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: NSWindow?
    private let html: String

    init(html: String) {
        self.html = html
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menuBar = NSMenu()
        let file = NSMenuItem()
        let fileMenu = NSMenu(title: "File")
        fileMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        file.submenu = fileMenu
        menuBar.addItem(file)
        let edit = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edit.submenu = editMenu
        menuBar.addItem(edit)
        NSApp.mainMenu = menuBar

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(self, name: "copy")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1080, height: 660),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.contentMinSize = NSSize(width: 610, height: 400)
        window.title = "Omok"
        window.contentView = webView
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("Omok Result Window")
        self.window = window

        webView.loadHTMLString(html, baseURL: nil)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func windowWillClose(_ notification: Notification) {
        NSApp.terminate(nil)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.absoluteString == "about:blank" ? .allow : .cancel)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let content = message.body as? [String: String],
              let text = content["text"] else { return }
        let item = NSPasteboardItem()
        item.setString(text, forType: .string)
        item.setString("", forType: NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType"))
        if let html = content["html"] { item.setString(html, forType: .html) }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.writeObjects([item])
    }
}

@main struct ApplicationEntry {
    @MainActor static func main() {
        let data = FileHandle.standardInput.readDataToEndOfFile()
        guard let html = String(data: data, encoding: .utf8), !html.isEmpty else { exit(1) }
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        let delegate = TableApplication(html: html)
        app.delegate = delegate
        app.run()
    }
}
