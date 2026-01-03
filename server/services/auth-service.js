// Minimaler Auth-Service: prüft Zugangsdaten und verzichtet bewusst auf
// zusätzliche Rate-Limits oder Dev-Sonderfälle.
import { HttpError } from "../http/http-error.js";

class AuthService {
  constructor({ userService }) {
    this.userService = userService;
  }

  async login(username, password) {
    if (typeof this.userService?.waitForSeedUsers === "function") {
      await this.userService.waitForSeedUsers();
    }
    const trimmedUsername = typeof username === "string" ? username.trim() : "";
    const normalizedPassword = typeof password === "string" ? password : "";

    if (!trimmedUsername || !normalizedPassword) {
      throw new HttpError(400, "Benutzername und Passwort werden benötigt.", {
        code: "missing-credentials",
      });
    }

    const user = await this.userService.verifyCredentials(trimmedUsername, normalizedPassword);
    if (!user) {
      throw new HttpError(401, "Ungültige Zugangsdaten.", { code: "invalid-credentials" });
    }

    return user;
  }
}

export { AuthService };
