// Einfache Fehlerklasse für HTTP-Antworten. Sie transportiert neben der
// Statusnummer auch, ob die Fehlermeldung an den Client ausgegeben werden
// darf, sowie optionale Fehlercodes oder Hinweise.
class HttpError extends Error {
  constructor(status, message, { expose = true, code = null, hint = null } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.expose = expose;
    this.code = code ?? `http-${status}`;
    this.hint = hint ?? undefined;
  }
}

export { HttpError };
