import { formatDuration } from "../utils/time.js";
import { formatDistance } from "../utils/distance.js";

/**
 * Aktualisiert sämtliche sichtbaren Auswertungen basierend auf den Planaggregationen.
 */
export function renderSummary(plan, dom) {
  const { totalTimeEl, totalDistanceEl, intensityListEl, equipmentListEl, blockListEl } = dom;

  totalTimeEl.textContent = formatDuration(plan.totalTime);
  totalDistanceEl.textContent = formatDistance(plan.totalDistance);

  intensityListEl.innerHTML = "";
  const intensityEntries = Array.from(plan.intensities.values()).sort((a, b) => b.distance - a.distance);
  if (intensityEntries.length === 0) {
    const placeholder = document.createElement("li");
    placeholder.textContent = "Keine Intensität erkannt";
    intensityListEl.appendChild(placeholder);
  } else {
    for (const item of intensityEntries) {
      const li = document.createElement("li");
      li.textContent = `${item.label} – ${formatDistance(item.distance)}`;
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
      li.textContent = `${item.label} (${item.count}×)`;
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

  for (const block of plan.blocks) {
    const li = document.createElement("li");
    li.className = "block-card";

    const title = document.createElement("h4");
    title.textContent = block.name;
    li.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "block-meta";

    const dist = document.createElement("span");
    dist.textContent = `Distanz: ${formatDistance(block.distance)}`;
    meta.appendChild(dist);

    const time = document.createElement("span");
    time.textContent = `Zeit: ${formatDuration(block.time)}`;
    meta.appendChild(time);

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
      roundsInfo.textContent = `Runden: ${parts.join(", ")}`;
      meta.appendChild(roundsInfo);
    }

    const focuses = [...new Set(block.sets.flatMap((set) => set.focus))];
    if (focuses.length > 0) {
      const focus = document.createElement("span");
      focus.textContent = `Fokus: ${focuses.join(", ")}`;
      meta.appendChild(focus);
    }

    li.appendChild(meta);
    blockListEl.appendChild(li);
  }
}
