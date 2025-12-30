function extractRequestUser(req) {
  const idHeader = req.headers?.["x-user-id"];
  const nameHeader = req.headers?.["x-user-name"];
  const roleHeader = req.headers?.["x-user-role"];
  const id = typeof idHeader === "string" && idHeader.trim() ? idHeader.trim() : null;
  if (!id) {
    return null;
  }
  const name = typeof nameHeader === "string" && nameHeader.trim() ? nameHeader.trim() : id;
  const role = typeof roleHeader === "string" && roleHeader.trim().toLowerCase() === "admin" ? "admin" : "user";
  return { id, name, role, roles: [role] };
}

export { extractRequestUser };
