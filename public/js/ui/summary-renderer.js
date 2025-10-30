import { formatDuration, formatPace } from "../utils/time.js";
import { formatDistance } from "../utils/distance.js";
import { getIntensityColorClass } from "./intensity-colors.js";

function formatSetDistance(set) {
  const lengthValue = Number.isFinite(set.displayLength)
    ? set.displayLength
    : Number.isFinite(set.length)
    ? set.length
    : 0;
  const unit = set.displayUnit ?? "m";
  const baseLength = `${lengthValue}${unit}`;
  if (set.quantity && set.quantity > 1) {
    return `${set.quantity}×${baseLength}`;
  }
  return baseLength;
}

function formatRoundLabel(set) {
  if (!set.rounds || set.rounds <= 1) {
    return null;
  }
  if (set.roundLabel) {
    return set.roundLabel.replace(/[:\s]+$/, "");
  }
  return `${set.rounds}×`;
}

function createTemplateButton(label, type, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `ghost-button save-template-button${extraClass ? ` ${extraClass}` : ""}`;
  button.textContent = label;
  button.dataset.templateType = type;
  return button;
}

/**
 * Aktualisiert sämtliche sichtbaren Auswertungen basierend auf den Planaggregationen.
 */
export function renderSummary(plan, dom) {
  const {
    totalTimeEl,
    totalDistanceEl,
    averagePaceEl,
    intensityListEl,
    equipmentListEl,
    blockListEl,
  } = dom;

  totalTimeEl.textContent = formatDuration(plan.totalTime);
  totalDistanceEl.textContent = formatDistance(plan.totalDistance);
  if (averagePaceEl) {
    averagePaceEl.textContent = plan.averagePaceSeconds
      ? formatPace(plan.averagePaceSeconds)
      : "–";
  }

  intensityListEl.innerHTML = "";
  const intensityEntries = Array.from(plan.intensities.values()).sort((a, b) => b.distance - a.distance);
  if (intensityEntries.length === 0) {
    const placeholder = document.createElement("li");
    placeholder.textContent = "Keine Intensität erkannt";
    intensityListEl.appendChild(placeholder);
  } else {
    const totalActiveTime = plan.activeTime ?? 0;
    for (const item of intensityEntries) {
      const li = document.createElement("li");
      li.classList.add("intensity-summary-item");

      const chip = document.createElement("span");
      chip.className = `intensity-chip ${getIntensityColorClass(item.label)}`;
      chip.textContent = item.label;
      li.appendChild(chip);

      const distanceValue = document.createElement("strong");
      distanceValue.className = "intensity-distance";
      distanceValue.textContent = formatDistance(item.distance);
      li.appendChild(distanceValue);

      if (totalActiveTime > 0 && Number.isFinite(item.activeTime) && item.activeTime > 0) {
        const share = document.createElement("span");
        share.className = "intensity-share";
        const percentage = Math.round((item.activeTime / totalActiveTime) * 1000) / 10;
        share.textContent = `${percentage.toFixed(1).replace(".0", "")} % Zeit`;
        li.appendChild(share);
      }

      if (item.distance > 0 && Number.isFinite(item.activeTime) && item.activeTime > 0) {
        const pace = document.createElement("span");
        pace.className = "intensity-pace";
        const paceSeconds = (item.activeTime / item.distance) * 100;
        pace.textContent = formatPace(paceSeconds);
        li.appendChild(pace);
      }

      intensityListEl.appendChild(li);
    }
  }

  equipmentListEl.innerHTML = "";
  const equipmentEntries = Array.from(plan.equipment.values()).sort((a, b) => b.count - a.count);
  if (equipmentEntries.length === 0) {
    const placeholder = document.createElement("li");
    placeholder.textContent = "Kein Material";
    equipmentListEl.appendChild(placeholder);
  } else {
    for (const item of equipmentEntries) {
      const li = document.createElement("li");
      li.innerHTML = `<em>${item.label}</em> (${item.count}×)`;
      equipmentListEl.appendChild(li);
    }
  }

  blockListEl.innerHTML = "";
  if (plan.blocks.length === 0) {
    const placeholder = document.createElement("li");
    placeholder.textContent = "Noch keine Blöcke";
    blockListEl.appendChild(placeholder);
    return;
  }

  plan.blocks.forEach((block, blockIndex) => {
    const li = document.createElement("li");
    li.className = "block-card";
    li.dataset.blockIndex = String(blockIndex);

    const blockName = (block.name ?? "").trim() || `Block ${blockIndex + 1}`;
    const header = document.createElement("div");
    header.className = "block-header";

    const title = document.createElement("h4");
    title.textContent = blockName;
    header.appendChild(title);

    const blockActions = document.createElement("div");
    blockActions.className = "block-actions";
    const blockButton = createTemplateButton("Block als Vorlage", "Block", "compact");
    blockButton.dataset.blockIndex = String(blockIndex);
    blockButton.setAttribute("aria-label", `Block „${blockName}“ als Vorlage speichern`);
    blockActions.appendChild(blockButton);
    header.appendChild(blockActions);

    li.appendChild(header);

    const meta = document.createElement("div");
    meta.className = "block-meta";

    const dist = document.createElement("span");
    dist.innerHTML = `Distanz: <strong>${formatDistance(block.distance)}</strong>`;
    meta.appendChild(dist);

    const time = document.createElement("span");
    time.textContent = `Zeit: ${formatDuration(block.time)}`;
    meta.appendChild(time);

    if (block.averagePaceSeconds) {
      const pace = document.createElement("span");
      pace.textContent = `Ø Pace: ${formatPace(block.averagePaceSeconds)}`;
      pace.className = "block-pace";
      meta.appendChild(pace);
    }

    const sets = document.createElement("span");
    sets.textContent = `Sets: ${block.sets.length}`;
    meta.appendChild(sets);

    const roundDetails = new Map();
    for (const set of block.sets) {
      const rounds = set.rounds ?? 1;
      if (rounds > 1) {
        const entry = roundDetails.get(rounds) ?? { rounds, sets: 0 };
        entry.sets += 1;
        roundDetails.set(rounds, entry);
      }
    }

    if (roundDetails.size > 0) {
      const roundsInfo = document.createElement("span");
      const parts = Array.from(roundDetails.values()).map((detail) => {
        const suffix = detail.sets === 1 ? "Set" : "Sets";
        return `${detail.rounds}× (${detail.sets} ${suffix})`;
      });
      roundsInfo.innerHTML = `Runden: <strong>${parts.join(", ")}</strong>`;
      meta.appendChild(roundsInfo);
    }

    const focuses = [...new Set(block.sets.flatMap((set) => set.focus))];
    if (focuses.length > 0) {
      const focus = document.createElement("span");
      focus.textContent = `Fokus: ${focuses.join(", ")}`;
      meta.appendChild(focus);
    }

    li.appendChild(meta);

    if (block.sets.length > 0) {
      const setList = document.createElement("ul");
      setList.className = "set-list";

      block.sets.forEach((set, setIndex) => {
        const setItem = document.createElement("li");
        const setItemClasses = ["set-item"];
        if (set.roundId) {
          setItemClasses.push("set-item--round-member");
        }
        setItem.className = setItemClasses.join(" ");

        const setLine = document.createElement("div");
        setLine.className = "set-line";

        const setDistance = document.createElement("strong");
        setDistance.className = "set-distance";
        setDistance.textContent = formatSetDistance(set);
        setLine.appendChild(setDistance);

        if (set.distance > 0) {
          const totalDistance = document.createElement("span");
          totalDistance.className = "set-total-distance";
          totalDistance.innerHTML = `= <strong>${formatDistance(set.distance)}</strong>`;
          setLine.appendChild(totalDistance);
        }

        const roundLabel = formatRoundLabel(set);
        if (roundLabel) {
          const rounds = document.createElement("strong");
          rounds.className = "set-rounds";
          rounds.textContent = ` · ${roundLabel}`;
          setLine.appendChild(rounds);
        }

        setItem.appendChild(setLine);

        const details = document.createElement("div");
        details.className = "set-details";

        if (set.interval > 0) {
          const interval = document.createElement("span");
          interval.className = "set-detail set-interval";
          interval.innerHTML = `Abgang: <em>${formatDuration(set.interval)}</em>`;
          details.appendChild(interval);
        }

        if (set.paceSecondsPer100) {
          const pace = document.createElement("span");
          pace.className = "set-detail set-pace";
          pace.innerHTML = `Ø Pace: <em>${formatPace(set.paceSecondsPer100)}</em>`;
          details.appendChild(pace);
        }

        if (set.pause > 0) {
          const pause = document.createElement("span");
          pause.className = "set-detail set-pause";
          if (set.rounds && set.rounds > 1) {
            const perRoundSeconds = Math.round(set.pause / set.rounds);
            const perRound = formatDuration(perRoundSeconds);
            pause.textContent = `Pause: ${perRound} pro Runde (${formatDuration(set.pause)})`;
          } else {
            pause.textContent = `Pause: ${formatDuration(set.pause)}`;
          }
          details.appendChild(pause);
        }

        if (set.equipment.length > 0) {
          const equipment = document.createElement("span");
          equipment.className = "set-detail set-equipment";
          equipment.innerHTML = `Material: <em>${set.equipment.join(", ")}</em>`;
          details.appendChild(equipment);
        }

        if (set.intensities.length > 0) {
          const intensities = document.createElement("span");
          intensities.className = "set-detail set-intensities";
          for (const intensity of set.intensities) {
            const chip = document.createElement("span");
            chip.className = `intensity-chip ${getIntensityColorClass(intensity)}`;
            chip.textContent = intensity;
            intensities.appendChild(chip);
          }
          details.appendChild(intensities);
        }

        if (set.focus.length > 0) {
          const focus = document.createElement("span");
          focus.className = "set-detail set-focus";
          focus.textContent = `Fokus: ${set.focus.join(", ")}`;
          details.appendChild(focus);
        }

        if (details.childElementCount > 0) {
          setItem.appendChild(details);
        }

        if (Array.isArray(set.notes) && set.notes.length > 0) {
          const notesContainer = document.createElement("div");
          notesContainer.className = "set-notes";

          const notesHeading = document.createElement("span");
          notesHeading.className = "set-notes-heading";
          notesHeading.textContent = "Hinweise:";
          notesContainer.appendChild(notesHeading);

          const notesList = document.createElement("ul");
          notesList.className = "set-notes-list";

          for (const note of set.notes) {
            if (typeof note !== "string" || note.trim().length === 0) {
              continue;
            }
            const noteItem = document.createElement("li");
            noteItem.textContent = note;
            notesList.appendChild(noteItem);
          }

          if (notesList.childElementCount > 0) {
            notesContainer.appendChild(notesList);
            setItem.appendChild(notesContainer);
          }
        }

        const setActions = document.createElement("div");
        setActions.className = "set-actions";
        const setButton = createTemplateButton("Set als Vorlage", "Set", "compact");
        setButton.dataset.blockIndex = String(blockIndex);
        setButton.dataset.setIndex = String(setIndex);
        const setLabel = (set.source ?? formatSetDistance(set) ?? "").trim() || `Set ${setIndex + 1}`;
        setButton.setAttribute(
          "aria-label",
          `Set „${setLabel}“ aus Block „${blockName}“ als Vorlage speichern`,
        );
        setActions.appendChild(setButton);
        setItem.appendChild(setActions);

        setList.appendChild(setItem);
      });

      li.appendChild(setList);
    }

    const validRounds = (block.rounds ?? []).filter(
      (round) => round && (typeof round.source === "string" ? round.source.trim().length > 0 : true),
    );

    if (validRounds.length > 0) {
      const roundsContainer = document.createElement("div");
      roundsContainer.className = "round-list";

      const roundsHeading = document.createElement("h5");
      roundsHeading.textContent = "Runden";
      roundsContainer.appendChild(roundsHeading);

      const roundList = document.createElement("ul");
      roundList.className = "round-items";

      validRounds.forEach((round, roundIndex) => {
        const roundItem = document.createElement("li");
        roundItem.className = "round-item";

        const label = document.createElement("span");
        label.className = "round-label";
        const labelText = (round.label ?? "").trim() || `${round.count ?? ""} Runden`;
        label.textContent = labelText;
        roundItem.appendChild(label);

        const roundButton = createTemplateButton("Runde als Vorlage", "Runde", "compact");
        roundButton.dataset.blockIndex = String(blockIndex);
        if (round.id) {
          roundButton.dataset.roundId = round.id;
        }
        roundButton.dataset.roundIndex = String(roundIndex);
        roundButton.setAttribute(
          "aria-label",
          `${labelText} aus Block „${blockName}“ als Vorlage speichern`,
        );
        roundItem.appendChild(roundButton);

        roundList.appendChild(roundItem);
      });

      roundsContainer.appendChild(roundList);
      li.appendChild(roundsContainer);
    }

    blockListEl.appendChild(li);
  });
}
