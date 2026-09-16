// Any drag gesture (card move, resize, canvas pan, kanban drag) that passes over
// text would otherwise start a native browser text selection. Toggle this while
// a drag is active to suppress that, without disabling selection globally -
// form controls keep native selection regardless of an ancestor's user-select.
export function setNoSelect(active: boolean) {
  document.body.classList.toggle('no-select', active)
}
