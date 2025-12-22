import { fetchAuthStatus } from "./auth-status.js";

export async function initAdminNavigation() {
  const adminLinks = Array.from(document.querySelectorAll("[data-admin-link]"));
  if (adminLinks.length === 0) {
    return;
  }

  let status;
  try {
    status = await fetchAuthStatus();
  } catch {
    status = { isAdmin: false };
  }

  const isAdmin = Boolean(status?.isAdmin);
  adminLinks.forEach((link) => {
    if (isAdmin) {
      link.hidden = false;
    } else {
      link.hidden = true;
    }
  });
}
