const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

async function setup() {
  const listeners = new Map();
  const writes = [];
  const errors = [];
  const client = {
    db: {},
    dbApi: {
      doc(collection, id = "new-id") { return `${collection}/${id}`; },
      onSnapshot(ref, callback) {
        listeners.set(ref, callback);
        return () => listeners.delete(ref);
      },
      writeBatch() {
        return {
          set(ref, data) { writes.push({ action: "set", ref, data }); },
          delete(ref) { writes.push({ action: "delete", ref }); },
          async commit() { writes.push({ action: "commit" }); }
        };
      }
    }
  };
  const context = vm.createContext({ console });
  const mocks = new vm.SyntheticModule(["profileRef", "sharedPlansRef", "tagPlansRef", "showError"], function () {
    this.setExport("profileRef", (_client, uid) => `users/${uid}`);
    this.setExport("sharedPlansRef", () => "sharedPlans");
    this.setExport("tagPlansRef", (_client, tag) => `tags/${tag}/plans`);
    this.setExport("showError", (error) => errors.push(error));
  }, { context });
  const source = fs.readFileSync(path.join(__dirname, "..", "tags.js"), "utf8");
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => mocks);
  await module.evaluate();
  return { api: module.namespace, client, listeners, writes, errors };
}

test("shared plan subscriptions deduplicate items and stop showing them after leaving all tags", async () => {
  const { api, client, listeners } = await setup();
  let visible = [];
  const stop = api.subscribeSharedPlans(client, { uid: "u" }, (plans) => { visible = plans; });
  const profile = (tags) => ({ exists: () => true, data: () => ({ tags }) });
  const index = (...ids) => ({ docs: ids.map((id) => ({ id })) });
  listeners.get("users/u")(profile(["math", "science"]));
  listeners.get("tags/math/plans")(index("p"));
  listeners.get("tags/science/plans")(index("p"));
  listeners.get("sharedPlans/p")({ exists: () => true, data: () => ({ title: "Test", tags: ["math", "science"] }) });
  assert.equal(visible.length, 1);
  listeners.get("users/u")(profile(["science"]));
  assert.equal(visible.length, 1);
  listeners.get("users/u")(profile([]));
  assert.equal(visible.length, 0);
  assert.equal(listeners.has("sharedPlans/p"), false);
  stop();
  assert.equal(listeners.size, 0);
});

test("shared creation and deletion update every tag index in one batch", async () => {
  const { api, client, writes } = await setup();
  await api.saveSharedPlan(client, { uid: "u" }, { title: "Test" }, ["math", "science"]);
  assert.deepEqual(writes.map((entry) => entry.ref || entry.action), ["sharedPlans/new-id", "tags/math/plans/new-id", "tags/science/plans/new-id", "commit"]);
  assert.equal(writes[0].data.createdBy, "u");
  writes.length = 0;
  await api.deleteSharedPlan(client, { id: "p", tags: ["math", "science"] });
  assert.deepEqual(writes.map((entry) => entry.ref || entry.action), ["sharedPlans/p", "tags/math/plans/p", "tags/science/plans/p", "commit"]);
});

test("capitalized tags with spaces retain their exact shared index path", async () => {
  const { api, client, writes } = await setup();
  await api.saveSharedPlan(client, { uid: "u" }, { title: "Test" }, ["Math Class"]);
  assert.equal(writes[1].ref, "tags/Math Class/plans/new-id");
  assert.equal(writes[0].data.tags[0], "Math Class");
});
