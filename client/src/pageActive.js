// "Is anyone actually looking at this tab right now" — combines two
// browser signals because either alone misses a real case:
// - document.visibilityState catches switching tabs or minimizing the
//   window, but NOT alt-tabbing to a different application while this
//   window sits open (but unfocused) in the background.
// - document.hasFocus() catches that case (OS-level input focus), but on
//   its own wouldn't catch a minimized/backgrounded tab either in every
//   browser.
// Together they cover both: tab-switch, minimize, AND switching to a
// completely different app.
export function isPageActive() {
  return document.visibilityState === 'visible' && document.hasFocus()
}
