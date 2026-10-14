import { inspectLists, editList } from "../core/listEditing.js";
import { expressionReference } from "./expressionReference.js";

export function createAuthoringTools(root, selected, applyList, insertExample) {
  const dialog = document.createElement("dialog");
  dialog.className = "authoringDialog";
  root.append(dialog);
  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, action) {
    const node = element("button", text);
    node.className = "btn";
    node.type = "button";
    node.onclick = () => Promise.resolve().then(action).catch(error => { notice.textContent = error.message; });
    return node;
  }
  const notice = element("p");
  notice.setAttribute("role", "alert");
  function open(title) {
    dialog.replaceChildren(element("h2", title), button("Close", () => dialog.close()), notice);
    notice.textContent = "";
    if (!dialog.open) dialog.showModal();
  }
  async function lists() {
    const selection = selected();
    if (!selection) throw new Error("Select a block first.");
    const choices = await inspectLists(selection.text);
    open("Edit imports, arguments and other lists");
    if (!choices.length) { notice.textContent = "This block has no supported list. Select an import, call, function, array or object block; use the code editor for other syntax."; return; }
    const picker = element("select");
    picker.setAttribute("aria-label", "List to edit");
    choices.forEach((list, index) => { const option = element("option", list.label); option.value = index; picker.append(option); });
    const rows = element("div");
    dialog.append(picker, rows);
    async function change(list, operation, index, value) {
      const replacement = editList(selection.text, list, operation, index, value);
      await applyList(selection, replacement);
      await lists();
    }
    function render() {
      const list = choices[Number(picker.value)];
      rows.replaceChildren(element("p", "Commas are managed for you. Each entry is JavaScript code; aliases use ‘name as alias’. Existing comments and line breaks are retained."));
      list.items.forEach((item, index) => {
        const row = element("div"); row.className = "listItem";
        const input = element("textarea"); input.value = item.text; input.setAttribute("aria-label", `Item ${index + 1}`);
        row.append(input, button("Update", () => change(list, "replace", index, input.value)), button("Remove", () => change(list, "remove", index)));
        rows.append(row);
      });
      const input = element("textarea"); input.placeholder = "New item, e.g. readFile as readText"; input.setAttribute("aria-label", "New list item");
      rows.append(input, button("Add item", () => change(list, "add", null, input.value)));
    }
    picker.onchange = render;
    render();
  }
  function reference() {
    open("Expression reference");
    dialog.append(element("p", "Examples are inserted, never executed. Edit names and values afterward. Insertions go after the selected block, or at the end of the file. Imports must be at module top level."));
    const search = element("input"); search.type = "search"; search.placeholder = "Search: logging, text, arrays, files…"; search.setAttribute("aria-label", "Search expressions");
    const results = element("div");
    dialog.append(search, results);
    function render() {
      results.replaceChildren();
      for (const entry of expressionReference.filter(entry => `${entry.name} ${entry.category} ${entry.description}`.toLowerCase().includes(search.value.toLowerCase()))) {
        const card = element("section"); card.className = "referenceCard";
        card.append(element("h3", `${entry.name} · ${entry.category}`), element("p", entry.description), element("pre", entry.code), button("Insert example", async () => { await insertExample(entry.code); dialog.close(); }));
        results.append(card);
      }
      if (!results.children.length) results.append(element("p", "No matching example. Custom expressions are still supported in editable fields."));
    }
    search.oninput = render;
    render();
  }
  return { lists, reference, dispose: () => dialog.remove() };
}
