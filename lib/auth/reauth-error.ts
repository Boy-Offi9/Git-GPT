export class ReauthRequiredError extends Error {
  constructor() {
    super("reauth_required");
    this.name = "ReauthRequiredError";
  }
}
