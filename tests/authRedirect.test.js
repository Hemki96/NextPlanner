import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLoginRedirectUrl,
  buildReturnPath,
  isLoginPath,
  resolvePostLoginTarget,
} from "../public/js/utils/auth-redirect.js";

describe("auth redirect helpers", () => {
  it("erkennt Login-Pfade robust", () => {
    assert.equal(isLoginPath("/login.html"), true);
    assert.equal(isLoginPath("/login"), true);
    assert.equal(isLoginPath("/login/"), true);
    assert.equal(isLoginPath("/planner.html"), false);
    assert.equal(isLoginPath("/"), false);
  });

  it("stellt Rücksprungpfade nur für Nicht-Login-Seiten zusammen", () => {
    const location = { pathname: "/planner.html", search: "?q=1", hash: "#section" };
    assert.equal(buildReturnPath(location), "/planner.html?q=1#section");
    assert.equal(buildReturnPath({ pathname: "/login.html", search: "?next=/planner" }), null);
  });

  it("baut Login-Redirect-URLs mit reason und next", () => {
    const url = buildLoginRedirectUrl({
      location: { pathname: "/templates.html", search: "?foo=bar", hash: "#anchor" },
      reason: "login-required",
    });
    assert.equal(url, "/login.html?reason=login-required&next=%2Ftemplates.html%3Ffoo%3Dbar%23anchor");
  });

  it("wählt sichere Weiterleitungsziele nach dem Login aus", () => {
    assert.equal(resolvePostLoginTarget("?next=/templates.html"), "/templates.html");
    assert.equal(resolvePostLoginTarget("?next=https://evil.test/attack"), "/index.html");
    assert.equal(resolvePostLoginTarget("", "/planner.html"), "/planner.html");
  });
});
