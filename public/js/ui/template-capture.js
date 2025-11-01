import {
  appendTemplate,
  getTemplateTypeLabel,
  parseTagsInput,
} from "../utils/template-storage.js";

function deriveSetLabel(set) {
  if (!set) {
    return "";
  }
  if (typeof set.source === "string" && set.source.trim()) {
    return set.source.trim();
  }
  const lengthValue = Number.isFinite(set.displayLength)
    ? set.displayLength
    : Number.isFinite(set.length)
    ? set.length
    : 0;
  const unit = set.displayUnit ?? "m";
  const baseLength = lengthValue ? `${lengthValue}${unit}` : "";
  if (!baseLength) {
    return (set.intensities && set.intensities.length > 0 ? set.intensities[0] : "").trim();
  }
  if (set.quantity && set.quantity > 1) {
    return `${set.quantity}×${baseLength}`;
  }
  return baseLength;
}

function buildBlockSnippet(block, blockName) {
  if (!block) {
    return "";
  }
  const sourceLines = Array.isArray(block.sourceLines) ? block.sourceLines : [];
  const primary = sourceLines.join("\n").trim();
  if (primary) {
    return primary;
  }
  const fallbackSets = (block.sets ?? [])
    .map((set) => deriveSetLabel(set))
    .filter((line) => typeof line === "string" && line.trim().length > 0);
  if (fallbackSets.length === 0) {
    return "";
  }
  if (blockName) {
    return [`## ${blockName}`, ...fallbackSets].join("\n");
  }
  return fallbackSets.join("\n");
}

function getSelectionFromButton(button, plan) {
  if (!(button instanceof HTMLButtonElement)) {
    return null;
  }
  const type = button.dataset.templateType;
  if (!type || !plan?.blocks) {
    return null;
  }
  const blockIndex = Number.parseInt(button.dataset.blockIndex ?? "", 10);
  if (!Number.isFinite(blockIndex) || blockIndex < 0 || blockIndex >= plan.blocks.length) {
    return null;
  }
  const block = plan.blocks[blockIndex];
  const blockName = (block.name ?? "").trim() || `Block ${blockIndex + 1}`;

  if (type === "Block") {
    const snippet = buildBlockSnippet(block, blockName);
    return {
      type,
      blockIndex,
      blockName,
      defaultTitle: blockName,
      snippet,
    };
  }

  if (type === "Set") {
    const setIndex = Number.parseInt(button.dataset.setIndex ?? "", 10);
    if (!Number.isFinite(setIndex) || setIndex < 0 || setIndex >= (block.sets?.length ?? 0)) {
      return null;
    }
    const set = block.sets[setIndex];
    const snippet = (typeof set.source === "string" ? set.source.trim() : "") || deriveSetLabel(set);
    return {
      type,
      blockIndex,
      setIndex,
      blockName,
      defaultTitle: deriveSetLabel(set) || `Set ${setIndex + 1}`,
      snippet,
    };
  }

  if (type === "Runde") {
    let round = null;
    const roundId = button.dataset.roundId;
    if (roundId) {
      round = (block.rounds ?? []).find((entry) => entry?.id === roundId) ?? null;
    }
    if (!round) {
      const roundIndex = Number.parseInt(button.dataset.roundIndex ?? "", 10);
      if (Number.isFinite(roundIndex) && roundIndex >= 0) {
        round = block.rounds?.[roundIndex] ?? null;
      }
    }
    if (!round) {
      return null;
    }
    const labelText = (round.label ?? "").trim() || `${round.count ?? ""} Runden`.trim();
    const snippet = (typeof round.source === "string" ? round.source.trim() : "") || labelText;
    return {
      type,
      blockIndex,
      blockName,
      roundId: round.id ?? null,
      label: labelText,
      defaultTitle: labelText || `Runde ${round.count ?? ""}`.trim(),
      snippet,
    };
  }

  return null;
}

function setStatus(statusElement, message, type = "info") {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = message;
  if (message) {
    statusElement.dataset.statusType = type;
  } else {
    delete statusElement.dataset.statusType;
  }
}

function clearStatus(statusElement) {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = "";
  delete statusElement.dataset.statusType;
}

export function initTemplateCapture({ blockList }) {
  if (!blockList) {
    return { update() {} };
  }

  const overlay = document.getElementById("template-capture");
  const form = document.getElementById("template-capture-form");
  const titleInput = document.getElementById("capture-title");
  const tagsInput = document.getElementById("capture-tags");
  const contentTextarea = document.getElementById("capture-content");
  const typeLabel = document.getElementById("capture-type-label");
  const statusElement = document.getElementById("capture-status");
  const cancelButton = document.getElementById("capture-cancel");
  const closeButton = document.getElementById("capture-close");

  if (!overlay || !form || !titleInput || !contentTextarea) {
    return {
      update(plan) {
        void plan;
      },
    };
  }

  let currentPlan = null;
  let selection = null;

  function closeOverlay() {
    overlay.classList.remove("is-visible");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("hidden", "");
    document.body.classList.remove("no-scroll");
    clearStatus(statusElement);
    form.reset();
    selection = null;
  }

  function openOverlay(data) {
    selection = data;
    clearStatus(statusElement);
    const typeText = getTemplateTypeLabel(selection.type);
    typeLabel.textContent = typeText;
    titleInput.value = selection.defaultTitle ?? "";
    contentTextarea.value = selection.snippet ?? "";
    if (tagsInput) {
      tagsInput.value = "";
    }

    overlay.removeAttribute("hidden");
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.add("is-visible");
    document.body.classList.add("no-scroll");

    window.setTimeout(() => {
      titleInput.focus();
      titleInput.select();
    }, 50);
  }

  function handleButtonClick(event) {
    const target = event.target instanceof Element ? event.target.closest(".save-template-button") : null;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (!currentPlan) {
      return;
    }
    const data = getSelectionFromButton(target, currentPlan);
    if (!data) {
      return;
    }
    if (!data.snippet) {
      openOverlay({ ...data, snippet: "" });
      setStatus(
        statusElement,
        "Keine Inhalte gefunden. Ergänze den Text, bevor du speicherst.",
        "warning",
      );
      return;
    }
    openOverlay(data);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selection) {
      return;
    }

    const title = titleInput.value.trim();
    const content = contentTextarea.value.trim();
    const tags = parseTagsInput(tagsInput?.value ?? "");

    if (!content) {
      setStatus(statusElement, "Der Vorlagentext darf nicht leer sein.", "warning");
      contentTextarea.focus();
      return;
    }

    try {
      await appendTemplate({
        type: selection.type,
        title: title || selection.defaultTitle || getTemplateTypeLabel(selection.type),
        notes: "",
        content,
        tags,
      });
      setStatus(statusElement, "Vorlage gespeichert.", "success");
      window.setTimeout(() => {
        closeOverlay();
      }, 600);
    } catch (error) {
      console.error("Vorlage konnte nicht erstellt werden.", error);
      setStatus(
        statusElement,
        error?.message || "Vorlage konnte nicht erstellt werden.",
        "warning",
      );
    }
  }

  blockList.addEventListener("click", handleButtonClick);

  cancelButton?.addEventListener("click", () => {
    closeOverlay();
  });

  closeButton?.addEventListener("click", () => {
    closeOverlay();
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeOverlay();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay.classList.contains("is-visible")) {
      event.preventDefault();
      closeOverlay();
    }
  });

  form.addEventListener("submit", (event) => {
    void handleSubmit(event);
  });

  return {
    update(plan) {
      currentPlan = plan;
    },
  };
}
