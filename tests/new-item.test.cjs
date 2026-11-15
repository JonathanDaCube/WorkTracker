const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

async function page(fail = false, selectedTags = []) {
  const submit = { disabled: true };
  const form = { querySelector: () => submit };
  const title = { addEventListener() {}, setCustomValidity() {}, reportValidity() {} };
  const options = { querySelectorAll: () => [], replaceChildren() {}, append() {} };
  const saved = [];
  const errors = [];
  let redirect;
  const client = {
    dbApi: {
      async addDoc(collection, plan) {
        if (fail) throw new Error("Save failed");
        saved.push({ collection, plan });
      }
    }
  };
  const context = vm.createContext({
    document: {
      querySelector: (selector) => selector === "#plan-form" ? form : selector === "#tag-options" ? options : title,
      createElement: () => ({ append() {} }),
      createTextNode: () => ({})
    },
    FormData: class {
      get(key) { return { title: "  Project  ", type: "assignment", date: "2099-12-01", time: "09:30", notes: "  Details  " }[key]; }
      getAll() { return selectedTags; }
    },
    location: { assign: (value) => { redirect = value; } },
    console
  });
  const shared = new vm.SyntheticModule(["setupPlanner"], function () {
    this.setExport("setupPlanner", (callback) => callback(client, { uid: "user-1" }));
  }, { context });
  const firebase = new vm.SyntheticModule(["plansRef", "showError", "clearError", "url"], function () {
    this.setExport("plansRef", (_client, uid) => `users/${uid}/plans`);
    this.setExport("showError", (error) => errors.push(error.message));
    this.setExport("clearError", () => {});
    this.setExport("url", () => "/WorkTracker/");
  }, { context });
  const tags = new vm.SyntheticModule(["subscribeTags", "saveSharedPlan"], function () {
    this.setExport("subscribeTags", (_client, _user, callback) => { callback(["math", "science"]); return () => {}; });
    this.setExport("saveSharedPlan", async (_client, user, plan, selected) => { saved.push({ user: user.uid, plan, tags: selected }); });
  }, { context });
  const source = fs.readFileSync(path.join(__dirname, "..", "new-item.js"), "utf8");
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => specifier === "./shared.js" ? shared : specifier === "./tags.js" ? tags : firebase);
  await module.evaluate();
  return { form, submit, saved, errors, get redirect() { return redirect; } };
}

test("saves a plan under the signed-in user and opens its calendar day", async () => {
  const app = await page();
  await app.form.onsubmit({ preventDefault() {} });
  assert.equal(app.saved[0].collection, "users/user-1/plans");
  assert.equal(app.saved[0].plan.title, "Project");
  assert.equal(app.saved[0].plan.notes, "Details");
  assert.equal(app.redirect, "/WorkTracker/?date=2099-12-01");
});

test("keeps the form available when saving fails", async () => {
  const app = await page(true);
  await app.form.onsubmit({ preventDefault() {} });
  assert.deepEqual(app.errors, ["Save failed"]);
  assert.equal(app.submit.disabled, false);
  assert.equal(app.redirect, undefined);
});

test("shares a plan with the selected tags", async () => {
  const app = await page(false, ["math", "science"]);
  await app.form.onsubmit({ preventDefault() {} });
  assert.equal(app.saved[0].user, "user-1");
  assert.deepEqual(app.saved[0].tags, ["math", "science"]);
});

test("does not save a plan to a tag the user has left", async () => {
  const app = await page(false, ["unknown"]);
  await app.form.onsubmit({ preventDefault() {} });
  assert.equal(app.saved.length, 0);
  assert.deepEqual(app.errors, ["Your tags changed. Please select your tags again."]);
});
