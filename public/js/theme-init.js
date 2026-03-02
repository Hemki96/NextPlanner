(() => {
  try {
    const storedTheme = localStorage.getItem("nextplanner-theme");
    if (storedTheme === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else if (storedTheme === "light") {
      delete document.documentElement.dataset.theme;
    }
  } catch {
    // Ignore storage access errors (e.g. private mode restrictions).
  }
})();
