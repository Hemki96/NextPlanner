import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AuthService, STATIC_USERS } from "../server/services/auth-service.js";

describe("AuthService", () => {
  it("ermöglicht Login mit bekannten Usern unabhängig von Groß-/Kleinschreibung", async () => {
    const service = new AuthService();
    const user = await service.login("Admin", STATIC_USERS.admin.password.toUpperCase());
    assert.equal(user.username, "admin");
    assert.deepEqual(user.roles, ["admin"]);
  });

  it("lehnt unbekannte oder falsche Zugangsdaten ab", async () => {
    const service = new AuthService();
    await assert.rejects(() => service.login("unknown", "unknown"));
    await assert.rejects(() => service.login("coach", "wrongpass"));
  });
});
