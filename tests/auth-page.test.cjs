const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

async function page(kind, existing = false) {
  class Element {
    constructor() { this.hidden = false; this.disabled = false; this.value = ""; this.handlers = {}; }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    querySelector() { return elements.submit; }
    click() { return this.handlers.click(); }
  }
  const elements = Object.fromEntries(["auth-form", "google-auth", "submit", "email", "password", "finish-signup", "cancel-signup", "signup-options", "complete-signup"].map((id) => [id, new Element()]));
  const auth = { currentUser: null };
  const user = { uid: "user-1" };
  const profiles = new Map(existing ? [[user.uid, { appearance: "dark" }]] : []);
  let observer;
  let failWrite = false;
  let redirected;
  const client = {
    auth,
    authApi: {
      onAuthStateChanged(_auth, callback) { observer = callback; callback(auth.currentUser); },
      GoogleAuthProvider: class {},
      async signInWithPopup() { auth.currentUser = user; observer(user); return { user }; },
      async createUserWithEmailAndPassword() { auth.currentUser = user; observer(user); return { user }; },
      async signInWithEmailAndPassword() { auth.currentUser = user; observer(user); return { user }; },
      async signOut() { auth.currentUser = null; observer(null); }
    },
    dbApi: {
      async getDoc(id) { return { exists: () => profiles.has(id) }; },
      async setDoc(id, data) {
        if (failWrite) throw new Error("Write failed");
        profiles.set(id, { ...profiles.get(id), ...data });
      }
    }
  };
  const errors = [];
  const context = vm.createContext({
    document: { body: { dataset: { page: kind } }, querySelector: (selector) => elements[selector.slice(1)] },
    location: { replace: (target) => { redirected = target; } },
    console
  });
  const mocks = new vm.SyntheticModule(["connectFirebase", "url", "profileRef", "showError", "clearError", "legacyAppearance"], function () {
    this.setExport("connectFirebase", async () => client);
    this.setExport("url", (value = "") => `/WorkTracker/${value}`);
    this.setExport("profileRef", (_client, uid) => uid);
    this.setExport("showError", (error) => errors.push(error.message));
    this.setExport("clearError", () => {});
    this.setExport("legacyAppearance", () => "system");
  }, { context });
  const source = fs.readFileSync(path.join(__dirname, "..", "auth-page.js"), "utf8");
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => mocks);
  await module.evaluate();
  const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(setImmediate); };
  await flush();
  return { elements, profiles, errors, flush, get redirected() { return redirected; }, set failWrite(value) { failWrite = value; } };
}

test("new Google sign-in redirects to signup; an existing user goes home", async () => {
  const newUser = await page("signin");
  newUser.elements["google-auth"].click();
  await newUser.flush();
  assert.equal(newUser.redirected, "/WorkTracker/signup/");
  assert.equal(newUser.profiles.size, 0);

  const existingUser = await page("signin", true);
  existingUser.elements["google-auth"].click();
  await existingUser.flush();
  assert.equal(existingUser.redirected, "/WorkTracker/");
});

test("Google signup requires completion before creating a profile", async () => {
  const signup = await page("signup");
  signup.elements["google-auth"].click();
  await signup.flush();
  assert.equal(signup.elements["complete-signup"].hidden, false);
  assert.equal(signup.profiles.size, 0);
  signup.elements["finish-signup"].click();
  await signup.flush();
  assert.equal(signup.profiles.get("user-1").appearance, "system");
  assert.equal(signup.redirected, "/WorkTracker/");
});

test("email signup can retry profile creation after a write failure", async () => {
  const signup = await page("signup");
  signup.failWrite = true;
  signup.elements["auth-form"].handlers.submit({ preventDefault() {} });
  await signup.flush();
  assert.deepEqual(signup.errors, ["Write failed"]);
  assert.equal(signup.elements["complete-signup"].hidden, false);
  signup.failWrite = false;
  signup.elements["finish-signup"].click();
  await signup.flush();
  assert.equal(signup.redirected, "/WorkTracker/");
});
