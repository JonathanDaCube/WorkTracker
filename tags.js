import { profileRef, sharedPlansRef, tagPlansRef, showError } from "./firebase-client.js";

export function subscribeTags(client, user, callback) {
  return client.dbApi.onSnapshot(profileRef(client, user.uid), (snapshot) => {
    if (!snapshot.exists()) return;
    const tags = snapshot.data().tags;
    callback(Array.isArray(tags) ? [...new Set(tags.filter((tag) => typeof tag === "string"))].sort() : []);
  }, showError);
}

export function subscribeSharedPlans(client, user, callback) {
  const indexes = new Map();
  const items = new Map();
  let stopped = false;
  const publish = () => callback([...items.values()].filter((item) => item.plan).map((item) => item.plan));
  const reconcile = () => {
    const ids = new Set([...indexes.values()].flatMap((index) => [...index.ids]));
    for (const [id, item] of items) {
      if (!ids.has(id)) {
        item.stop();
        items.delete(id);
      }
    }
    for (const id of ids) {
      if (items.has(id)) continue;
      const item = { plan: null, stop: () => {} };
      items.set(id, item);
      item.stop = client.dbApi.onSnapshot(client.dbApi.doc(sharedPlansRef(client), id), (snapshot) => {
        if (stopped || items.get(id) !== item) return;
        item.plan = snapshot.exists() ? { ...snapshot.data(), id, shared: true } : null;
        publish();
      }, (error) => {
        if (stopped || items.get(id) !== item) return;
        item.plan = null;
        publish();
        showError(error);
      });
    }
    publish();
  };
  const stopTags = subscribeTags(client, user, (tags) => {
    for (const [tag, index] of indexes) {
      if (!tags.includes(tag)) {
        index.stop();
        indexes.delete(tag);
      }
    }
    for (const tag of tags) {
      if (indexes.has(tag)) continue;
      const index = { ids: new Set(), stop: () => {} };
      indexes.set(tag, index);
      index.stop = client.dbApi.onSnapshot(tagPlansRef(client, tag), (snapshot) => {
        if (stopped || indexes.get(tag) !== index) return;
        index.ids = new Set(snapshot.docs.map((entry) => entry.id));
        reconcile();
      }, (error) => {
        if (stopped || indexes.get(tag) !== index) return;
        index.ids.clear();
        reconcile();
        showError(error);
      });
    }
    reconcile();
  });
  return () => {
    stopped = true;
    stopTags();
    for (const index of indexes.values()) index.stop();
    for (const item of items.values()) item.stop();
  };
}

export async function saveSharedPlan(client, user, plan, tags) {
  const ref = client.dbApi.doc(sharedPlansRef(client));
  const batch = client.dbApi.writeBatch(client.db);
  batch.set(ref, { ...plan, createdBy: user.uid, tags });
  for (const tag of tags) batch.set(client.dbApi.doc(tagPlansRef(client, tag), ref.id), {});
  await batch.commit();
}

export async function deleteSharedPlan(client, plan) {
  const batch = client.dbApi.writeBatch(client.db);
  batch.delete(client.dbApi.doc(sharedPlansRef(client), plan.id));
  for (const tag of plan.tags) batch.delete(client.dbApi.doc(tagPlansRef(client, tag), plan.id));
  await batch.commit();
}
