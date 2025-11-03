const baseMappings = new Map();

function addMapping(className, classList) {
  const existing = baseMappings.get(className);
  if (existing) {
    const merged = new Set([...existing, ...classList]);
    baseMappings.set(className, Array.from(merged));
  } else {
    baseMappings.set(className, Array.from(new Set(classList)));
  }
}

const surfaceClasses = [
  "rounded-3xl",
  "border",
  "border-white/40",
  "bg-white/80",
  "w-full",
  "p-6",
  "shadow-xl",
  "shadow-sky-200/40",
  "backdrop-blur",
  "transition",
  "duration-200",
  "dark:border-slate-700/60",
  "dark:bg-slate-900/70",
  "dark:shadow-black/20",
];

[
  "page-card",
  "template-card",
  "template-panel-card",
  "feature-toggle",
  "plan-entry",
  "trend-volume-item",
  "trend-intensity-item",
  "trend-pace-item",
  "plan-import-item",
  "block-card",
  "round-item",
  "snippet-settings-item",
  "template-section",
  "template-panel-item",
  "plan-io-menu",
  "plan-io-section",
].forEach((name) => addMapping(name, surfaceClasses));

addMapping("page-card", ["grid", "gap-5"]);
addMapping("calendar-card", ["gap-5"]);
addMapping("template-card", ["grid", "gap-3"]);
addMapping("template-panel-card", ["grid", "gap-3"]);
addMapping("template-section", ["grid", "gap-4"]);
addMapping("plan-import-item", ["grid", "gap-3"]);
addMapping("block-card", ["grid", "gap-3"]);
addMapping("round-item", ["grid", "gap-2"]);

addMapping("primary-button", [
  "inline-flex",
  "items-center",
  "justify-center",
  "rounded-full",
  "bg-gradient-to-r",
  "from-sky-500",
  "to-cyan-500",
  "px-5",
  "py-2",
  "text-sm",
  "font-semibold",
  "text-white",
  "shadow-lg",
  "shadow-sky-200/50",
  "transition",
  "hover:shadow-xl",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-offset-2",
  "focus-visible:ring-sky-400",
  "dark:from-sky-500",
  "dark:to-blue-500",
  "dark:shadow-sky-900/60",
]);

addMapping("secondary-button", [
  "inline-flex",
  "items-center",
  "justify-center",
  "rounded-full",
  "border",
  "border-sky-400/50",
  "bg-sky-50",
  "px-4",
  "py-2",
  "text-sm",
  "font-semibold",
  "text-sky-700",
  "transition",
  "hover:bg-sky-100",
  "hover:text-sky-800",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-offset-2",
  "focus-visible:ring-sky-400",
  "dark:border-sky-500/60",
  "dark:bg-slate-900",
  "dark:text-sky-200",
  "dark:hover:bg-slate-800",
]);

addMapping("ghost-button", [
  "inline-flex",
  "items-center",
  "justify-center",
  "rounded-full",
  "border",
  "border-slate-300/70",
  "bg-white/40",
  "px-4",
  "py-2",
  "text-sm",
  "font-semibold",
  "text-slate-700",
  "transition",
  "hover:bg-sky-100",
  "hover:text-slate-900",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-offset-2",
  "focus-visible:ring-sky-400",
  "disabled:cursor-not-allowed",
  "disabled:opacity-50",
  "dark:border-slate-600",
  "dark:bg-slate-900/60",
  "dark:text-slate-200",
  "dark:hover:bg-slate-800",
  "dark:hover:text-white",
]);

addMapping("ghost-button", ["gap-2"]);

addMapping("danger-button", [
  "inline-flex",
  "items-center",
  "justify-center",
  "rounded-full",
  "bg-gradient-to-r",
  "from-rose-500",
  "to-rose-600",
  "px-4",
  "py-2",
  "text-sm",
  "font-semibold",
  "text-white",
  "shadow",
  "shadow-rose-200/40",
  "transition",
  "hover:shadow-lg",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-offset-2",
  "focus-visible:ring-rose-400",
]);

addMapping("is-quiet", [
  "border-transparent",
  "bg-transparent",
  "text-slate-500",
  "hover:bg-slate-100/60",
  "hover:text-slate-700",
  "dark:text-slate-400",
  "dark:hover:bg-slate-800/60",
  "dark:hover:text-slate-200",
]);
addMapping("page-header", [
  "mx-auto",
  "flex",
  "w-full",
  "max-w-5xl",
  "flex-col",
  "gap-4",
  "text-center",
  "lg:text-left",
]);
addMapping("page-nav", [
  "mt-6",
  "flex",
  "flex-wrap",
  "justify-center",
  "gap-2",
  "lg:justify-start",
]);
addMapping("nav-link", [
  "inline-flex",
  "items-center",
  "rounded-full",
  "border",
  "border-transparent",
  "px-4",
  "py-2",
  "text-sm",
  "font-semibold",
  "text-slate-600",
  "transition",
  "hover:-translate-y-px",
  "hover:border-sky-400/40",
  "hover:bg-sky-100",
  "hover:text-slate-900",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-offset-2",
  "focus-visible:ring-sky-400",
  "dark:text-slate-300",
  "dark:hover:bg-slate-800",
  "dark:hover:text-white",
]);
addMapping("calendar-layout", [
  "mx-auto",
  "grid",
  "w-full",
  "max-w-6xl",
  "gap-6",
  "lg:grid-cols-[1.35fr,1fr]",
  "lg:items-start",
]);
addMapping("page-content", [
  "mx-auto",
  "grid",
  "w-full",
  "max-w-5xl",
  "gap-6",
]);
addMapping("layout", [
  "mx-auto",
  "grid",
  "w-full",
  "max-w-6xl",
  "gap-6",
  "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1fr)]",
  "lg:items-start",
]);
addMapping("quick-panel", [
  "flex",
  "flex-col",
  "gap-4",
]);
addMapping("quick-snippet-header", [
  "flex",
  "flex-col",
  "gap-3",
]);
addMapping("quick-snippet-title-row", [
  "flex",
  "items-center",
  "justify-between",
  "gap-3",
]);
addMapping("quick-panel-toggle", [
  "text-sm",
  "font-semibold",
  "text-sky-600",
  "hover:text-sky-500",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-offset-2",
  "focus-visible:ring-sky-400",
  "dark:text-sky-300",
  "dark:hover:text-sky-200",
]);
addMapping("quick-snippet-hint", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("quick-snippet-groups", [
  "flex",
  "flex-col",
  "gap-3",
]);
addMapping("quick-snippet-group", [
  "rounded-2xl",
  "border",
  "border-slate-200/60",
  "bg-white/60",
  "p-4",
  "shadow",
  "dark:border-slate-700/60",
  "dark:bg-slate-900/60",
]);
addMapping("quick-snippet-description", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("quick-snippet-buttons", [
  "flex",
  "flex-wrap",
  "gap-2",
]);
addMapping("quick-snippet-button", [
  "rounded-full",
  "border",
  "border-slate-200/70",
  "bg-white/70",
  "px-3",
  "py-1.5",
  "text-xs",
  "font-semibold",
  "text-slate-600",
  "shadow-sm",
  "transition",
  "hover:bg-sky-100",
  "hover:text-slate-900",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-sky-400",
  "dark:border-slate-700",
  "dark:bg-slate-900",
  "dark:text-slate-300",
  "dark:hover:bg-slate-800",
  "dark:hover:text-white",
]);
addMapping("input-panel", [
  "flex",
  "flex-col",
  "gap-5",
]);
addMapping("plan-editor", [
  "relative",
  "overflow-hidden",
  "rounded-3xl",
  "border",
  "border-slate-200/60",
  "bg-white/70",
  "shadow",
  "dark:border-slate-700/60",
  "dark:bg-slate-900/60",
]);
addMapping("input-panel-header", [
  "flex",
  "items-center",
  "justify-between",
  "gap-3",
]);
addMapping("insights-panel", [
  "flex",
  "flex-col",
  "gap-5",
]);
addMapping("summary-panel", [
  "flex",
  "flex-col",
  "gap-4",
]);
addMapping("summary-grid", [
  "grid",
  "gap-4",
  "sm:grid-cols-2",
]);
addMapping("section-header", [
  "flex",
  "flex-wrap",
  "items-center",
  "justify-between",
  "gap-3",
]);
addMapping("section-actions", [
  "flex",
  "flex-wrap",
  "items-center",
  "gap-2",
]);
addMapping("calendar-hint", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("calendar-grid", [
  "grid",
  "grid-cols-7",
  "gap-2",
]);
addMapping("calendar-weekday", [
  "text-center",
  "text-sm",
  "font-semibold",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("calendar-cell", [
  "flex",
  "justify-center",
]);
addMapping("calendar-day", [
  "flex",
  "aspect-square",
  "w-full",
  "flex-col",
  "items-center",
  "justify-center",
  "gap-1",
  "rounded-2xl",
  "border",
  "border-transparent",
  "bg-white/60",
  "font-medium",
  "text-slate-700",
  "shadow",
  "transition",
  "hover:-translate-y-0.5",
  "hover:border-sky-300/60",
  "hover:shadow-lg",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-sky-400",
  "dark:bg-slate-900/60",
  "dark:text-slate-200",
  "dark:hover:border-sky-500/60",
  "dark:hover:bg-slate-800",
]);
addMapping("calendar-day-number", [
  "text-lg",
  "font-semibold",
]);
addMapping("calendar-marker", [
  "h-1.5",
  "w-1.5",
  "rounded-full",
  "bg-transparent",
  "transition",
]);
addMapping("plan-list", [
  "flex",
  "flex-col",
  "gap-3",
]);
addMapping("calendar-create", [
  "flex",
  "flex-col",
  "items-start",
  "gap-2",
]);
addMapping("calendar-create-hint", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("calendar-week-export", [
  "mt-2",
  "flex",
  "flex-wrap",
  "items-center",
  "gap-2",
]);
addMapping("calendar-empty", [
  "text-sm",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("plan-entry", [
  "grid",
  "gap-3",
]);
addMapping("plan-entry-header", [
  "flex",
  "flex-wrap",
  "items-baseline",
  "justify-between",
  "gap-3",
]);
addMapping("plan-entry-time", [
  "text-sm",
  "font-semibold",
  "text-sky-600",
  "dark:text-sky-300",
]);
addMapping("plan-entry-meta", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("plan-entry-notes", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("plan-entry-actions", [
  "flex",
  "flex-wrap",
  "gap-2",
]);
addMapping("plan-entry-link", [
  "text-xs",
  "font-semibold",
]);
addMapping("form-status", [
  "text-sm",
  "font-medium",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("form-status-success", ["text-emerald-600", "dark:text-emerald-400"]);
addMapping("form-status-warning", ["text-amber-600", "dark:text-amber-400"]);
addMapping("form-status-error", ["text-rose-600", "dark:text-rose-400"]);
addMapping("form-grid", [
  "grid",
  "gap-4",
  "md:grid-cols-2",
]);
addMapping("form-field", [
  "flex",
  "flex-col",
  "gap-1.5",
]);
addMapping("field-hint", [
  "text-xs",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("form-actions", [
  "flex",
  "flex-wrap",
  "gap-3",
  "items-center",
]);
addMapping("form-hint", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("template-form", [
  "grid",
  "gap-5",
]);
addMapping("template-grid", [
  "grid",
  "gap-4",
  "md:grid-cols-2",
]);
addMapping("template-filter", [
  "grid",
  "gap-5",
]);
addMapping("template-filter-grid", [
  "grid",
  "gap-4",
  "md:grid-cols-3",
]);
addMapping("template-filter-range-grid", [
  "grid",
  "gap-4",
  "md:grid-cols-4",
]);
addMapping("template-filter-actions", [
  "flex",
  "flex-wrap",
  "items-center",
  "justify-between",
  "gap-3",
]);
addMapping("template-filter-summary", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("template-list", [
  "grid",
  "gap-4",
]);
addMapping("template-card-header", [
  "flex",
  "flex-wrap",
  "items-start",
  "justify-between",
  "gap-3",
]);
addMapping("template-notes", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("tag-list", [
  "flex",
  "flex-wrap",
  "gap-1.5",
]);
addMapping("template-tag-list", [
  "mt-2",
]);
addMapping("template-content", [
  "rounded-2xl",
  "border",
  "border-slate-200/60",
  "bg-slate-50/70",
  "p-4",
  "font-mono",
  "text-sm",
  "text-slate-700",
  "dark:border-slate-700/60",
  "dark:bg-slate-900/60",
  "dark:text-slate-200",
]);
addMapping("template-actions", [
  "flex",
  "flex-wrap",
  "gap-2",
]);
addMapping("settings-grid", [
  "grid",
  "gap-6",
  "md:grid-cols-2",
]);
addMapping("settings-section", [
  "rounded-3xl",
  "border",
  "border-slate-200/60",
  "bg-white/70",
  "p-5",
  "shadow",
  "dark:border-slate-700/60",
  "dark:bg-slate-900/60",
]);
addMapping("switch-field", [
  "flex",
  "items-center",
  "justify-between",
  "gap-3",
]);
addMapping("switch-label", [
  "flex",
  "flex-col",
  "gap-1",
]);
addMapping("switch-control", [
  "flex",
  "items-center",
  "gap-2",
]);
addMapping("switch-state", [
  "text-xs",
  "font-semibold",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("theme-actions", [
  "flex",
  "flex-wrap",
  "items-center",
  "gap-2",
]);
addMapping("theme-reset", [
  "text-sm",
  "font-semibold",
  "text-sky-600",
  "hover:text-sky-500",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-offset-2",
  "focus-visible:ring-sky-400",
  "dark:text-sky-300",
  "dark:hover:text-sky-200",
]);
addMapping("empty-hint", [
  "rounded-2xl",
  "border",
  "border-dashed",
  "border-slate-300/60",
  "bg-white/40",
  "p-6",
  "text-center",
  "text-sm",
  "text-slate-600",
  "dark:border-slate-700/60",
  "dark:bg-slate-900/40",
  "dark:text-slate-400",
]);
addMapping("feature-toggle", [
  "flex",
  "flex-col",
  "gap-4",
  "md:flex-row",
  "md:items-center",
  "md:justify-between",
]);
addMapping("feature-toggle-list", [
  "mt-4",
  "grid",
  "gap-4",
]);
addMapping("feature-toggle-info", [
  "flex-1",
  "space-y-2",
]);
addMapping("feature-toggle-title", [
  "text-lg",
  "font-semibold",
  "text-slate-800",
  "dark:text-slate-100",
]);
addMapping("feature-toggle-description", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("feature-toggle-control", [
  "flex",
  "items-center",
  "gap-3",
]);
addMapping("feature-toggle-switch", [
  "flex",
  "items-center",
  "gap-3",
  "text-sm",
  "font-semibold",
  "text-slate-600",
  "dark:text-slate-300",
]);
addMapping("feature-toggle-state", [
  "min-w-[4ch]",
  "text-right",
  "text-xs",
  "font-medium",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("feature-disabled-card", [
  "items-center",
  "text-center",
]);
addMapping("feature-disabled-message", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("plan-io-controls", [
  "relative",
]);
addMapping("plan-io-menu", [
  "absolute",
  "right-0",
  "top-full",
  "z-10",
  "mt-2",
  "w-64",
]);
addMapping("plan-io-heading", [
  "text-sm",
  "font-semibold",
  "text-slate-700",
  "dark:text-slate-200",
]);
addMapping("plan-io-list", [
  "mt-2",
  "space-y-2",
]);
addMapping("plan-io-action", [
  "w-full",
  "rounded-xl",
  "border",
  "border-slate-200/60",
  "bg-white/70",
  "px-4",
  "py-2",
  "text-left",
  "text-sm",
  "font-semibold",
  "text-slate-700",
  "shadow-sm",
  "transition",
  "hover:bg-sky-100",
  "hover:text-slate-900",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-sky-400",
  "dark:border-slate-700/60",
  "dark:bg-slate-900/60",
  "dark:text-slate-200",
  "dark:hover:bg-slate-800",
  "dark:hover:text-white",
]);
addMapping("plan-io-hint", [
  "text-xs",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("plan-import-choice", [
  "flex",
  "w-full",
  "items-center",
  "justify-between",
  "gap-3",
]);
addMapping("plan-import-choice-title", [
  "text-sm",
  "font-semibold",
]);
addMapping("plan-import-choice-meta", [
  "text-xs",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("plan-import-description", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("trend-empty", [
  "text-sm",
  "text-slate-500",
  "dark:text-slate-400",
  "text-center",
]);
addMapping("trend-volume-row", [
  "flex",
  "items-center",
  "justify-between",
  "gap-3",
]);
addMapping("trend-volume-title", [
  "text-sm",
  "font-medium",
]);
addMapping("trend-volume-value", [
  "text-sm",
  "font-semibold",
]);
addMapping("trend-volume-change", [
  "text-xs",
  "font-semibold",
]);
addMapping("trend-bar", [
  "h-2",
  "overflow-hidden",
  "rounded-full",
  "bg-slate-200/70",
  "dark:bg-slate-700/60",
]);
addMapping("trend-intensity-row", [
  "flex",
  "items-center",
  "justify-between",
  "gap-3",
]);
addMapping("trend-intensity-label", [
  "text-sm",
  "font-medium",
]);
addMapping("trend-intensity-share", [
  "text-sm",
  "font-semibold",
]);
addMapping("trend-intensity-distance", [
  "text-xs",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("trend-pace-row", [
  "flex",
  "items-center",
  "justify-between",
  "gap-3",
]);
addMapping("trend-pace-date", [
  "text-sm",
  "font-medium",
]);
addMapping("trend-pace-title", [
  "text-xs",
  "uppercase",
  "tracking-wide",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("trend-pace-value", [
  "text-sm",
  "font-semibold",
]);
addMapping("trend-pace-change", [
  "text-xs",
  "font-semibold",
]);
addMapping("validation-panel", [
  "rounded-3xl",
  "border",
  "border-slate-200/60",
  "bg-white/70",
  "p-4",
  "shadow",
  "dark:border-slate-700/60",
  "dark:bg-slate-900/60",
]);
addMapping("validation-header", [
  "flex",
  "flex-wrap",
  "items-center",
  "justify-between",
  "gap-3",
]);
addMapping("validation-summary", [
  "text-sm",
  "font-medium",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("validation-list", [
  "space-y-3",
  "mt-3",
]);
addMapping("validation-issue", [
  "rounded-2xl",
  "border",
  "border-slate-200/60",
  "bg-white/70",
  "p-3",
  "shadow-sm",
  "dark:border-slate-700/60",
  "dark:bg-slate-900/60",
]);
addMapping("validation-issue-button", [
  "text-left",
  "text-sm",
  "font-semibold",
  "text-slate-700",
  "hover:text-sky-600",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-sky-400",
  "dark:text-slate-200",
  "dark:hover:text-sky-300",
]);
addMapping("validation-issue-preview", [
  "mt-2",
  "rounded-xl",
  "bg-slate-100/80",
  "p-3",
  "text-xs",
  "font-mono",
  "text-slate-600",
  "dark:bg-slate-800/70",
  "dark:text-slate-300",
]);
addMapping("validation-empty", [
  "text-sm",
  "text-slate-500",
  "dark:text-slate-400",
  "text-center",
]);
addMapping("plan-highlight", [
  "pointer-events-none",
]);
addMapping("plan-highlight-content", [
  "whitespace-pre-wrap",
  "font-mono",
  "text-sm",
]);
addMapping("plan-line", [
  "min-h-[1.6em]",
  "block",
]);
addMapping("plan-io-overlay", [
  "fixed",
  "inset-0",
  "z-50",
  "flex",
  "items-center",
  "justify-center",
  "bg-slate-900/80",
  "p-6",
]);
addMapping("plan-import-overlay", [
  "fixed",
  "inset-0",
  "z-50",
  "flex",
  "items-center",
  "justify-center",
  "bg-slate-900/80",
  "p-6",
]);
addMapping("plan-import-container", [
  "w-full",
  "max-w-3xl",
]);
addMapping("plan-import-actions", [
  "flex",
  "flex-wrap",
  "items-center",
  "justify-between",
  "gap-3",
]);
addMapping("plan-import-list", [
  "grid",
  "gap-3",
]);
addMapping("snippet-settings-group", [
  "flex",
  "flex-col",
  "gap-3",
]);
addMapping("snippet-settings-header", [
  "flex",
  "flex-wrap",
  "items-start",
  "justify-between",
  "gap-3",
]);
addMapping("snippet-settings-title-row", [
  "flex",
  "items-center",
  "gap-3",
]);
addMapping("snippet-settings-title", [
  "text-lg",
  "font-semibold",
  "text-slate-800",
  "dark:text-slate-100",
]);
addMapping("snippet-settings-count", [
  "inline-flex",
  "items-center",
  "rounded-full",
  "bg-slate-100/80",
  "px-2.5",
  "py-0.5",
  "text-xs",
  "font-semibold",
  "text-slate-600",
  "dark:bg-slate-800/60",
  "dark:text-slate-300",
]);
addMapping("snippet-settings-header-actions", [
  "flex",
  "flex-wrap",
  "items-center",
  "gap-2",
]);
addMapping("number-field", [
  "flex",
  "items-center",
  "gap-2",
]);
addMapping("snippet-settings-number", [
  "w-20",
]);
addMapping("snippet-settings-body", [
  "space-y-3",
]);
addMapping("snippet-settings-description", [
  "text-sm",
  "text-slate-600",
  "dark:text-slate-400",
]);
addMapping("snippet-settings-items", [
  "space-y-3",
]);
addMapping("snippet-settings-input", [
  "text-sm",
]);
addMapping("snippet-settings-text", [
  "font-mono",
  "text-sm",
]);
addMapping("snippet-settings-checkboxes", [
  "flex",
  "flex-wrap",
  "gap-3",
]);
addMapping("checkbox-field", [
  "flex",
  "items-center",
  "gap-2",
]);
addMapping("snippet-settings-actions", [
  "flex",
  "flex-wrap",
  "items-center",
  "gap-2",
]);
addMapping("snippet-settings-add-item", [
  "mt-2",
]);
addMapping("template-panel-group", [
  "space-y-4",
]);
addMapping("template-panel-list", [
  "grid",
  "gap-3",
]);
addMapping("template-panel-preview", [
  "rounded-2xl",
  "border",
  "border-slate-200/60",
  "bg-slate-50/70",
  "p-3",
  "font-mono",
  "text-xs",
  "dark:border-slate-700/60",
  "dark:bg-slate-900/60",
  "dark:text-slate-300",
]);
addMapping("template-panel-actions", [
  "flex",
  "flex-wrap",
  "items-center",
  "gap-2",
]);
addMapping("template-panel-tags", [
  "mt-2",
]);
addMapping("theme-settings", [
  "space-y-4",
]);
addMapping("toggle-control", [
  "flex",
  "flex-wrap",
  "items-center",
  "gap-4",
]);
addMapping("switch", [
  "inline-flex",
  "items-center",
  "justify-center",
]);
addMapping("intensity-chip", [
  "inline-flex",
  "items-center",
  "gap-1.5",
  "rounded-full",
  "bg-slate-100/80",
  "px-3",
  "py-1",
  "text-xs",
  "font-semibold",
  "text-slate-600",
  "dark:bg-slate-800/60",
  "dark:text-slate-300",
]);
addMapping("intensity-distance", [
  "text-xs",
  "font-medium",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("intensity-share", [
  "text-xs",
  "font-medium",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("block-header", [
  "flex",
  "flex-wrap",
  "items-center",
  "justify-between",
  "gap-3",
]);
addMapping("block-actions", [
  "flex",
  "flex-wrap",
  "items-center",
  "gap-2",
]);
addMapping("block-meta", [
  "grid",
  "gap-2",
]);
addMapping("block-pace", [
  "text-xs",
  "font-medium",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("set-list", [
  "space-y-3",
]);
addMapping("set-line", [
  "font-mono",
  "text-sm",
]);
addMapping("set-distance", [
  "text-sm",
  "font-semibold",
]);
addMapping("set-total-distance", [
  "text-xs",
  "font-medium",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("round-list", [
  "space-y-3",
]);
addMapping("round-items", [
  "space-y-2",
]);
addMapping("round-label", [
  "text-sm",
  "font-medium",
]);
addMapping("set-detail", [
  "text-xs",
  "font-medium",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("set-actions", [
  "flex",
  "flex-wrap",
  "gap-2",
]);
addMapping("set-notes", [
  "mt-2",
  "space-y-1.5",
]);
addMapping("set-notes-heading", [
  "text-xs",
  "font-semibold",
  "uppercase",
  "tracking-wide",
  "text-slate-500",
  "dark:text-slate-400",
]);
addMapping("set-notes-list", [
  "list-disc",
  "pl-5",
  "text-xs",
  "text-slate-500",
  "dark:text-slate-400",
]);

const stateRules = [
  {
    apply(element) {
      if (element.classList.contains("nav-link")) {
        const activeClasses = [
          "border-sky-400/60",
          "bg-sky-100",
          "text-slate-900",
          "dark:bg-slate-800",
          "dark:border-sky-500/50",
          "dark:text-white",
        ];
        if (element.classList.contains("is-active")) {
          element.classList.add(...activeClasses);
        } else {
          element.classList.remove(...activeClasses);
        }
      }
    },
  },
  {
    apply(element) {
      if (element.classList.contains("calendar-day")) {
        const selectedClasses = [
          "border-sky-500",
          "bg-sky-100",
          "shadow-lg",
          "shadow-sky-200/60",
          "dark:border-sky-400",
          "dark:bg-slate-800",
        ];
        const outsideClasses = ["text-slate-400", "dark:text-slate-500", "bg-white/40", "dark:bg-slate-900/40"];

        if (element.classList.contains("is-selected")) {
          element.classList.add(...selectedClasses);
        } else {
          element.classList.remove(...selectedClasses);
        }

        if (element.classList.contains("is-outside-month")) {
          element.classList.add(...outsideClasses);
        } else {
          element.classList.remove(...outsideClasses);
        }

        const marker = element.querySelector(".calendar-marker");
        if (marker) {
          marker.classList.remove("bg-sky-500", "dark:bg-sky-300");
          if (element.classList.contains("has-plans")) {
            marker.classList.add("bg-sky-500", "dark:bg-sky-300");
          }
        }
      }
    },
  },
  {
    apply(element) {
      if (element.classList.contains("layout")) {
        if (element.classList.contains("layout--snippets-hidden")) {
          element.classList.add("lg:grid-cols-[minmax(0,1fr)]");
        } else {
          element.classList.remove("lg:grid-cols-[minmax(0,1fr)]");
        }
      }
    },
  },
  {
    apply(element) {
      if (element.classList.contains("form-status")) {
        const statusType = element.getAttribute("data-status-type");
        const mapping = {
          success: "form-status-success",
          warning: "form-status-warning",
          error: "form-status-error",
        };
        const targetClass = mapping[statusType] ?? null;
        Object.values(mapping).forEach((className) => {
          element.classList.toggle(className, className === targetClass);
        });
      }
    },
  },
];

function applyBaseClasses(element) {
  element.classList.forEach((className) => {
    const mapped = baseMappings.get(className);
    if (mapped) {
      element.classList.add(...mapped);
    }
  });
}

function applyStateClasses(element) {
  for (const rule of stateRules) {
    rule.apply(element);
  }
}

function applyToTree(root) {
  if (!(root instanceof Element)) {
    return;
  }
  applyBaseClasses(root);
  applyStateClasses(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  let current;
  while ((current = walker.nextNode())) {
    applyBaseClasses(current);
    applyStateClasses(current);
  }
}

function initTailwindStyling() {
  document.documentElement.classList.add("font-sans", "antialiased");
  document.body.classList.add(
    "min-h-screen",
    "flex",
    "flex-col",
    "items-center",
    "gap-8",
    "bg-gradient-to-br",
    "from-sky-100",
    "via-white",
    "to-slate-100",
    "px-4",
    "py-8",
    "text-slate-900",
    "dark:from-slate-950",
    "dark:via-slate-900",
    "dark:to-slate-950",
    "dark:text-slate-100",
  );
  applyToTree(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            applyToTree(node);
          }
        });
      } else if (mutation.type === "attributes" && mutation.target instanceof Element) {
        applyBaseClasses(mutation.target);
        applyStateClasses(mutation.target);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    attributes: true,
    subtree: true,
    attributeFilter: ["class", "data-status-type"],
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTailwindStyling, { once: true });
} else {
  initTailwindStyling();
}
