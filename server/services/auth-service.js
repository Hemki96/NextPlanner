// Handhabt Anmeldung und Rate-Limits. Kapselt Logik für Fehlermeldungen und
// Sperrlisten, um Brute-Force-Versuche einzudämmen.
import { HttpError } from "../http/http-error.js";

class LoginRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs;
    this.maxAttempts = options.maxAttempts;
    this.blockDurationMs = options.blockDurationMs;
    this.buckets = new Map();
  }

  buildKeys(ip, username) {
    const keys = [];
    if (ip) keys.push(`ip:${ip}`);
    if (username) keys.push(`user:${username}`);
    if (ip && username) keys.push(`combo:${username}@${ip}`);
    return keys;
  }

  check(ip, username) {
    const now = Date.now();
    const keys = this.buildKeys(ip, username);
    let blockedUntil = null;
    for (const key of keys) {
      const entry = this.buckets.get(key);
      if (!entry) continue;
      const windowExpired = entry.firstAttempt + this.windowMs < now;
      if (entry.blockedUntil && entry.blockedUntil > now) {
        blockedUntil = Math.max(blockedUntil ?? 0, entry.blockedUntil);
      } else if (windowExpired) {
        this.buckets.delete(key);
      }
    }
    return { allowed: blockedUntil === null, blockedUntil, keys, now };
  }

  recordFailure(ip, username) {
    const { keys, now } = this.check(ip, username);
    let blockedUntil = null;
    let highestCount = 0;
    for (const key of keys) {
      const entry = this.buckets.get(key);
      const withinWindow = entry ? now - entry.firstAttempt <= this.windowMs : false;
      const count = withinWindow ? (entry?.count ?? 0) + 1 : 1;
      const firstAttempt = withinWindow && entry ? entry.firstAttempt : now;
      const blocked =
        count >= this.maxAttempts ? now + this.blockDurationMs : entry?.blockedUntil ?? null;
      this.buckets.set(key, { count, firstAttempt, blockedUntil: blocked });
      if (blocked && (!blockedUntil || blocked > blockedUntil)) {
        blockedUntil = blocked;
      }
      if (count > highestCount) {
        highestCount = count;
      }
    }
    const remainingAttempts = Math.max(0, this.maxAttempts - highestCount);
    const retryAfterSeconds = blockedUntil ? Math.max(1, Math.ceil((blockedUntil - now) / 1000)) : null;
    return { blockedUntil, remainingAttempts, attempts: highestCount, retryAfterSeconds };
  }

  recordSuccess(ip, username) {
    const { keys } = this.check(ip, username);
    for (const key of keys) {
      this.buckets.delete(key);
    }
  }
}

class AuthService {
  constructor({ userService, rateLimit }) {
    this.userService = userService;
    this.limiter = new LoginRateLimiter(rateLimit);
  }

  async login(username, password, { ip }) {
    if (typeof this.userService?.waitForSeedUsers === "function") {
      await this.userService.waitForSeedUsers();
    }
    const trimmedUsername = typeof username === "string" ? username.trim() : "";
    const normalizedPassword = typeof password === "string" ? password : "";

    if (!trimmedUsername || !normalizedPassword) {
      throw new HttpError(400, "Benutzername und Passwort werden benötigt.", {
        code: "missing-credentials",
        hint: "Mindestens ein Anmeldefeld war leer.",
      });
    }

    const check = this.limiter.check(ip, trimmedUsername);
    if (!check.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(((check.blockedUntil ?? check.now) - check.now) / 1000));
      throw new HttpError(429, "Zu viele fehlgeschlagene Anmeldeversuche. Bitte warten Sie kurz.", {
        code: "rate-limit",
        hint: `Login vorübergehend gesperrt. Bitte ${retryAfterSeconds} Sekunden warten.`,
      });
    }
    const user = await this.userService.verifyCredentials(trimmedUsername, normalizedPassword);
    if (!user) {
      const failure = this.limiter.recordFailure(ip, trimmedUsername);
      const remaining = failure?.remainingAttempts ?? null;
      const blockedHint =
        failure?.blockedUntil && failure?.retryAfterSeconds
          ? `Login gesperrt. Bitte ${failure.retryAfterSeconds} Sekunden warten.`
          : null;
      const remainingHint =
        typeof remaining === "number" && remaining >= 0
          ? `Noch ${remaining} Versuch(e), bevor der Login gesperrt wird.`
          : null;
      throw new HttpError(401, "Ungültige Zugangsdaten.", {
        code: failure?.blockedUntil ? "rate-limit" : "invalid-credentials",
        hint: blockedHint ?? remainingHint ?? undefined,
      });
    }
    this.limiter.recordSuccess(ip, trimmedUsername);
    return user;
  }
}

export { AuthService, LoginRateLimiter };
