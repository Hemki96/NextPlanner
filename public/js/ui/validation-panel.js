function createIssueListItem(issue) {
  const li = document.createElement("li");
  li.className = "validation-issue";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "validation-issue-button";
  if (Number.isFinite(issue.lineNumber)) {
    button.dataset.lineNumber = String(issue.lineNumber);
  }
  const labelParts = [];
  if (Number.isFinite(issue.lineNumber)) {
    labelParts.push(`Zeile ${issue.lineNumber}`);
  }
  if (typeof issue.message === "string" && issue.message.trim()) {
    labelParts.push(issue.message.trim());
  }
  button.textContent = labelParts.join(" · ") || "Unbekannte Zeile";
  const preview = document.createElement("span");
  preview.className = "validation-issue-preview";
  if (typeof issue.line === "string" && issue.line.trim()) {
    preview.textContent = issue.line.trim();
  }
  li.append(button);
  if (preview.textContent) {
    li.append(preview);
  }
  return li;
}

function focusLine(textarea, lineNumber) {
  if (!textarea || !Number.isFinite(lineNumber) || lineNumber <= 0) {
    return;
  }
  const lines = textarea.value.split(/\n/);
  let offset = 0;
  for (let index = 0; index < lineNumber - 1 && index < lines.length; index += 1) {
    offset += lines[index].length + 1;
  }
  const targetLine = lines[lineNumber - 1] ?? "";
  const end = offset + targetLine.length;
  textarea.focus();
  textarea.setSelectionRange(offset, end);
}

export function initValidationPanel({ container, textarea, highlighter }) {
  if (!container) {
    return {
      update() {},
    };
  }

  const list = container.querySelector("[data-validation-list]") ?? container;
  const summary = container.querySelector("[data-validation-summary]");
  let currentIssues = [];

  const render = () => {
    if (!list) {
      return;
    }
    list.innerHTML = "";
    if (!currentIssues || currentIssues.length === 0) {
      const empty = document.createElement("li");
      empty.className = "validation-empty";
      empty.textContent = "Keine Syntax-Hinweise – alles sieht gut aus.";
      list.append(empty);
      if (summary) {
        summary.textContent = "Keine Probleme erkannt";
      }
      return;
    }

    const fragment = document.createDocumentFragment();
    currentIssues.forEach((issue) => {
      fragment.append(createIssueListItem(issue));
    });
    list.append(fragment);
    if (summary) {
      const count = currentIssues.length;
      summary.textContent = `${count} Hinweis${count === 1 ? "" : "e"}`;
    }
  };

  container.addEventListener("click", (event) => {
    const button = event.target.closest("button.validation-issue-button");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const lineNumber = Number.parseInt(button.dataset.lineNumber ?? "", 10);
    if (Number.isFinite(lineNumber)) {
      focusLine(textarea, lineNumber);
    }
  });

  const update = (issues) => {
    currentIssues = Array.isArray(issues) ? issues.slice() : [];
    currentIssues.sort((a, b) => {
      const aLine = Number.isFinite(a?.lineNumber) ? a.lineNumber : Number.POSITIVE_INFINITY;
      const bLine = Number.isFinite(b?.lineNumber) ? b.lineNumber : Number.POSITIVE_INFINITY;
      if (aLine !== bLine) {
        return aLine - bLine;
      }
      return (a?.message ?? "").localeCompare(b?.message ?? "", "de");
    });
    render();
    if (highlighter && typeof highlighter.setIssues === "function") {
      highlighter.setIssues(currentIssues);
    }
  };

  render();

  return {
    update,
  };
}
