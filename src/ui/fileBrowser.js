export function createFileBrowser(host, openFile, report) {
  let folderName = "";
  async function populate(container, relative, initial) {
    const result = initial || await window.zbc.listFolder(relative);
    if (result.error) throw new Error(result.error);
    container.replaceChildren();
    for (const entry of result.entries) {
      if (entry.directory) {
        const branch = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = entry.name;
        const children = document.createElement("div");
        children.className = "folderChildren";
        let loaded = false;
        branch.append(summary, children);
        branch.addEventListener("toggle", () => {
          if (!branch.open || loaded) return;
          loaded = true;
          void populate(children, entry.relative).catch(error => { loaded = false; report(error.message); });
        });
        container.append(branch);
      } else {
        const button = document.createElement("button");
        button.className = "fileEntry";
        button.textContent = entry.name;
        button.title = entry.relative;
        button.dataset.file = entry.relative;
        button.addEventListener("click", () => { void openFile(entry.relative).catch(error => report(error.message)); });
        container.append(button);
      }
    }
    if (result.truncated) {
      const warning = document.createElement("p");
      warning.textContent = "Showing the first 2,000 entries. Open a smaller folder to browse the rest.";
      container.append(warning);
    }
  }
  return {
    async open() {
      const result = await window.zbc.openFolder();
      if (result.canceled) return;
      if (result.error) throw new Error(result.error);
      folderName = result.name;
      host.hidden = false;
      host.closest(".workbench").classList.add("has-folder");
      host.querySelector(".folderName").textContent = folderName;
      await populate(host.querySelector(".fileTree"), "", result);
    },
    async refresh() {
      if (folderName) await populate(host.querySelector(".fileTree"), "");
    },
  };
}
