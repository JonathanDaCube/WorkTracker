import { setupPlanner } from "./shared.js";
import { profileRef, showError, clearError } from "./firebase-client.js";
import { subscribeTags } from "./tags.js";

const form = document.querySelector("#tag-form");
const input = document.querySelector("#tag-name");
const list = document.querySelector("#tags-list");
const submit = form.querySelector('button[type="submit"]');

setupPlanner((client, user) => {
  let tags = [];
  let busy = false;
  const update = async (value) => {
    busy = true;
    submit.disabled = true;
    clearError();
    try {
      await client.dbApi.updateDoc(profileRef(client, user.uid), { tags: value });
    } catch (error) {
      showError(error);
      return false;
    } finally {
      busy = false;
      submit.disabled = false;
    }
    return true;
  };
  const stop = subscribeTags(client, user, (value) => {
    tags = value;
    submit.disabled = busy;
    list.replaceChildren();
    if (!tags.length) {
      const empty = document.createElement("p");
      empty.className = "form-help";
      empty.textContent = "You haven't joined any tags.";
      list.append(empty);
      return;
    }
    for (const tag of tags) {
      const row = document.createElement("div");
      row.className = "tag-row";
      const name = document.createElement("span");
      name.textContent = tag;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-button";
      remove.textContent = "Leave";
      remove.setAttribute("aria-label", `Leave tag ${tag}`);
      remove.onclick = async () => {
        if (busy) return;
        if (!confirm(`Leave "${tag}"? You will no longer see its shared plans unless you rejoin.`)) return;
        await update(client.dbApi.arrayRemove(tag));
      };
      row.append(name, remove);
      list.append(row);
    }
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const tag = input.value.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(tag)) {
      input.setCustomValidity("Use 1–40 letters, numbers, spaces, hyphens or underscores, starting with a letter or number.");
      input.reportValidity();
      return;
    }
    if (tags.includes(tag)) {
      input.setCustomValidity("You have already joined this tag.");
      input.reportValidity();
      return;
    }
    if (await update(client.dbApi.arrayUnion(tag))) input.value = "";
  };
  input.oninput = () => input.setCustomValidity("");
  return () => { stop(); submit.disabled = true; form.onsubmit = null; };
});
