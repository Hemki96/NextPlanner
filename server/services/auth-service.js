// Minimaler Auth-Service: prüft Zugangsdaten und verzichtet bewusst auf
// zusätzliche Rate-Limits oder Dev-Sonderfälle.
import { HttpError } from "../http/http-error.js";

const STATIC_USERS = Object.freeze({
  admin: { username: "admin", password: "admin", roles: ["admin"] },
  coach: { username: "coach", password: "coach", roles: ["coach"] },
  athlet: { username: "athlet", password: "athlet", roles: ["athlet"] },
});

class AuthService {
  constructor() {}

  async login(username, password) {
    const trimmedUsername = typeof username === "string" ? username.trim() : "";
    const normalizedPassword = typeof password === "string" ? password.trim() : "";

    if (!trimmedUsername || !normalizedPassword) {
      throw new HttpError(400, "Benutzername und Passwort werden benötigt.", {
        code: "missing-credentials",
      });
    }

    const user = STATIC_USERS[trimmedUsername];
    if (!user || normalizedPassword !== user.password) {
      throw new HttpError(401, "Ungültige Zugangsdaten.", { code: "invalid-credentials" });
    }

    return {
      id: user.username,
      username: user.username,
      roles: user.roles,
      isAdmin: user.roles.includes("admin"),
    };
  }
}

export { AuthService, STATIC_USERS };
