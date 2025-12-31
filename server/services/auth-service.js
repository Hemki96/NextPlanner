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
    }
    return blockedUntil;
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
      throw new HttpError(429, "Zu viele fehlgeschlagene Anmeldeversuche. Bitte warten Sie kurz.", {
        code: "rate-limit",
      });
    }
    const user = await this.userService.verifyCredentials(trimmedUsername, normalizedPassword);
    if (!user) {
      this.limiter.recordFailure(ip, trimmedUsername);
      throw new HttpError(401, "Ungültige Zugangsdaten.", { code: "invalid-credentials" });
    }
    this.limiter.recordSuccess(ip, trimmedUsername);
    return user;
  }
}

export { AuthService, LoginRateLimiter };
