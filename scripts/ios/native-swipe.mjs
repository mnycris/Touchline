// The installed iPhone app's swipe back, the system's own: run after `npx cap add ios` (codemagic.yaml), it gives the
// generated Xcode project a view controller of its own (Capacitor's, with three things more) and makes it the app's.
//   - WebKit's back gesture on the web view (allowsBackForwardNavigationGestures): the swipe from the left edge with
//     the screen beneath shown as it was left, the system's spring, parallax and shadow, as in every iPhone app. The
//     web app keeps one history entry per screen to go back through, so the gesture is its Back (src/ui/systemBack.ts).
//   - the forward swipe from the right edge off: an app goes back, not forward.
//   - the swipe on or off as the web app says ({ swipeBack } on the "touchline" message handler): off on the tabs'
//     roots, a live match, under a sheet, wherever the screen has no Back of one step.
// The class goes into AppDelegate.swift (already in the app target, so the project file isn't touched) and the
// storyboard's root view controller becomes it. Fails loudly if the generated files aren't as expected.
//   node scripts/ios/native-swipe.mjs [ios/App/App]
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2] || 'ios/App/App'
const delegate = path.join(dir, 'AppDelegate.swift')
const storyboard = path.join(dir, 'Base.lproj', 'Main.storyboard')
const fail = (m) => { console.error(`native-swipe: ${m}`); process.exit(1) }
if (!fs.existsSync(delegate)) fail(`${delegate} not found (run after npx cap add ios)`)
if (!fs.existsSync(storyboard)) fail(`${storyboard} not found`)

const CLASS = `
// Touchline: the iPhone's own swipe back in the app's web view (scripts/ios/native-swipe.mjs). WebKit's back gesture
// over the web app's history (one entry per screen to go back through), the forward swipe off, and the swipe on or
// off as the web app says.
class TouchlineViewController: CAPBridgeViewController, WKScriptMessageHandler {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }
        webView.allowsBackForwardNavigationGestures = true
        edgeSwipes(.right).forEach { $0.isEnabled = false }
        webView.configuration.userContentController.add(self, name: "touchline")
    }

    /// WebKit's swipe gestures on the web view, by the edge they start from.
    private func edgeSwipes(_ edge: UIRectEdge) -> [UIGestureRecognizer] {
        return (webView?.gestureRecognizers ?? []).filter { ($0 as? UIScreenEdgePanGestureRecognizer)?.edges.contains(edge) == true }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "touchline", let body = message.body as? [String: Any], let on = body["swipeBack"] as? Bool else { return }
        let back = edgeSwipes(.left)
        if back.isEmpty { webView?.allowsBackForwardNavigationGestures = on } else { back.forEach { $0.isEnabled = on } }
    }
}
`

let swift = fs.readFileSync(delegate, 'utf8')
if (!swift.includes('class TouchlineViewController')) {
  if (!/^import Capacitor$/m.test(swift)) fail('AppDelegate.swift has no "import Capacitor"')
  if (!/^import WebKit$/m.test(swift)) swift = swift.replace(/^import Capacitor$/m, 'import Capacitor\nimport WebKit')
  swift = swift.trimEnd() + '\n' + CLASS
  fs.writeFileSync(delegate, swift)
}

let sb = fs.readFileSync(storyboard, 'utf8')
if (!sb.includes('customClass="TouchlineViewController"')) {
  const tag = sb.match(/<viewController\b[^>]*customClass="CAPBridgeViewController"[^>]*>/)
  if (!tag) fail('Main.storyboard has no CAPBridgeViewController to replace')
  let t = tag[0].replace('customClass="CAPBridgeViewController"', 'customClass="TouchlineViewController"')
  t = /customModule="[^"]*"/.test(t) ? t.replace(/customModule="[^"]*"/, 'customModule="App" customModuleProvider="target"') : t.replace('customClass=', 'customModule="App" customModuleProvider="target" customClass=')
  sb = sb.replace(tag[0], t)
  fs.writeFileSync(storyboard, sb)
}
console.log('native-swipe: the app\'s view controller is TouchlineViewController (WebKit\'s swipe back, forward off, on/off from the web app)')
