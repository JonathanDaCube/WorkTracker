const { test } = require("node:test");
const assert = require("node:assert/strict");

const host = process.env.FIRESTORE_EMULATOR_HOST;
const project = "demo-worktracker";
const root = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
const docName = (path) => `projects/${project}/databases/(default)/documents/${path}`;
const string = (value) => ({ stringValue: value });
const array = (values) => ({ arrayValue: { values: values.map(string) } });

function token(uid) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    iss: `https://securetoken.google.com/${project}`,
    aud: project,
    sub: uid,
    user_id: uid,
    iat: 1700000000,
    exp: 4102444800,
    firebase: { sign_in_provider: "password" }
  })}.`;
}

async function request(path, uid, body, method = "GET") {
  const response = await fetch(`${root}${path}`, {
    method,
    headers: {
      ...(uid ? { Authorization: `Bearer ${token(uid)}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return response.status;
}

function write(path, fields) {
  return { update: { name: docName(path), fields } };
}
function remove(path) {
  return { delete: docName(path) };
}

test("Firestore rules restrict shared plans to tag members and allow any member to delete", { skip: !host }, async () => {
  assert.equal(await request("/users/alice", "alice", { fields: { tags: array(["math", "science"]) } }, "PATCH"), 200);
  assert.equal(await request("/users/bob", "bob", { fields: { tags: array(["math"]) } }, "PATCH"), 200);
  assert.equal(await request("/users/carol", "carol", { fields: { tags: array(["history"]) } }, "PATCH"), 200);
  assert.equal(await request("/users/alice", "carol"), 403);

  const plan = { createdBy: string("alice"), title: string("Homework"), tags: array(["math", "science"]) };
  assert.equal(await request(":commit", "alice", { writes: [
    write("sharedPlans/plan1", plan),
    write("tags/math/plans/plan1", {}),
    write("tags/science/plans/plan1", {})
  ] }, "POST"), 200);
  assert.equal(await request("/tags/math/plans", "bob"), 200);
  assert.equal(await request("/tags/science/plans", "bob"), 403);
  assert.equal(await request("/sharedPlans/plan1", "bob"), 200);
  assert.equal(await request("/sharedPlans/plan1", "carol"), 403);
  assert.equal(await request("/sharedPlans/plan1", null), 403);
  assert.equal(await request("/users/bob", "bob", { fields: { tags: array([]) } }, "PATCH"), 200);
  assert.equal(await request("/sharedPlans/plan1", "bob"), 403);
  assert.equal(await request("/tags/math/plans", "bob"), 403);
  assert.equal(await request("/users/bob", "bob", { fields: { tags: array(["math"]) } }, "PATCH"), 200);
  assert.equal(await request(":commit", "carol", { writes: [
    remove("sharedPlans/plan1"), remove("tags/math/plans/plan1"), remove("tags/science/plans/plan1")
  ] }, "POST"), 403);
  assert.equal(await request(":commit", "bob", { writes: [
    remove("sharedPlans/plan1"), remove("tags/math/plans/plan1"), remove("tags/science/plans/plan1")
  ] }, "POST"), 200);
  assert.equal(await request("/sharedPlans/plan1", "bob"), 404);
});

test("Firestore rules reject sharing to tags the creator has not joined and protect private plans", { skip: !host }, async () => {
  assert.equal(await request("/users/dave", "dave", { fields: { tags: array(["math"]) } }, "PATCH"), 200);
  assert.equal(await request(":commit", "dave", { writes: [
    write("sharedPlans/plan2", { createdBy: string("dave"), tags: array(["history"]) }),
    write("tags/history/plans/plan2", {})
  ] }, "POST"), 403);
  assert.equal(await request("/users/dave/plans/private", "dave", { fields: { title: string("Private") } }, "PATCH"), 200);
  assert.equal(await request("/users/dave/plans/private", "bob"), 403);
});
