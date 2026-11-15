const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

async function setup(initialTags = []) {
  class Element {
    constructor() { this.children = []; this.value = ""; this.disabled = false; this.validity = ""; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    querySelector() { return submit; }
    setAttribute() {}
    setCustomValidity(value) { this.validity = value; }
    reportValidity() {}
  }
  const form = new Element();
  const input = new Element();
  const list = new Element();
  const submit = new Element();
  let tags = [...initialTags];
  let notify;
  const client = {
    dbApi: {
      arrayUnion: (value) => ({ add: value }),
      arrayRemove: (value) => ({ remove: value }),
      async updateDoc(_ref, update) {
        tags = update.tags.add ? [...tags, update.tags.add] : tags.filter((tag) => tag !== update.tags.remove);
        notify(tags);
      }
    }
  };
  const context = vm.createContext({
    document: {
      querySelector: (selector) => ({ "#tag-form": form, "#tag-name": input, "#tags-list": list })[selector],
      createElement: () => new Element()
    },
    confirm: () => true
  });
  const shared = new vm.SyntheticModule(["setupPlanner"], function () {
    this.setExport("setupPlanner", (callback) => callback(client, { uid: "u" }));
  }, { context });
  const firebase = new vm.SyntheticModule(["profileRef", "showError", "clearError"], function () {
    this.setExport("profileRef", () => "users/u");
    this.setExport("showError", (error) => { throw error; });
    this.setExport("clearError", () => {});
  }, { context });
  const tagModule = new vm.SyntheticModule(["subscribeTags"], function () {
    this.setExport("subscribeTags", (_client, _user, callback) => { notify = callback; callback(tags); return () => {}; });
  }, { context });
  const module = new vm.SourceTextModule(fs.readFileSync(path.join(__dirname, "..", "settings.js"), "utf8"), { context });
  await module.link((specifier) => specifier === "./shared.js" ? shared : specifier === "./tags.js" ? tagModule : firebase);
  await module.evaluate();
  return { form, input, list, get tags() { return tags; } };
}

test("joining preserves capitalization and spaces, and leaving removes the tag", async () => {
  const app = await setup();
  app.input.value = "  Math Class  ";
  await app.form.onsubmit({ preventDefault() {} });
  assert.deepEqual(app.tags, ["Math Class"]);
  await app.list.children[0].children[1].onclick();
  assert.deepEqual(app.tags, []);
});

test("invalid and duplicate tags are rejected", async () => {
  const app = await setup(["math"]);
  app.input.value = "a/b";
  await app.form.onsubmit({ preventDefault() {} });
  assert.match(app.input.validity, /letters/);
  app.input.value = "math";
  await app.form.onsubmit({ preventDefault() {} });
  assert.match(app.input.validity, /already joined/);
  assert.deepEqual(app.tags, ["math"]);
});

test("tags with different capitalization are distinct", async () => {
  const app = await setup(["math class"]);
  app.input.value = "Math Class";
  await app.form.onsubmit({ preventDefault() {} });
  assert.deepEqual(app.tags, ["math class", "Math Class"]);
});

test("whitespace-only and overlong tags are rejected", async () => {
  const app = await setup();
  for (const tag of ["   ", "a".repeat(41)]) {
    app.input.value = tag;
    await app.form.onsubmit({ preventDefault() {} });
    assert.match(app.input.validity, /letters/);
  }
  assert.deepEqual(app.tags, []);
});
