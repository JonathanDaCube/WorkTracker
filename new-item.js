import { setupPlanner } from "./shared.js";
import { plansRef, showError, clearError, url } from "./firebase-client.js";
import { subscribeTags, saveSharedPlan } from "./tags.js";

const form = document.querySelector("#plan-form");
const title = document.querySelector("#title");
title.addEventListener("input", () => title.setCustomValidity(""));

setupPlanner((client, user) => {
  const submit = form.querySelector('button[type="submit"]');
  const options = document.querySelector("#tag-options");
  let availableTags = [];
  let saving = false;
  const stop = subscribeTags(client, user, (tags) => {
    const checked = new Set([...options.querySelectorAll('input:checked')].map((input) => input.value));
    availableTags = tags;
    options.replaceChildren();
    options.className = "tag-options";
    if (!tags.length) {
      const empty = document.createElement("p");
      empty.className = "form-help";
      empty.textContent = "You haven't joined any tags.";
      options.append(empty);
    }
    for (const tag of tags) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "tags";
      checkbox.value = tag;
      checkbox.checked = checked.has(tag);
      label.append(checkbox, document.createTextNode(` ${tag}`));
      options.append(label);
    }
    submit.disabled = saving;
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(form);
    const name = String(data.get("title")).trim();
    if (!name) {
      title.setCustomValidity("Please enter a name for your plan.");
      title.reportValidity();
      return;
    }
    const plan = {
      type: String(data.get("type")),
      title: name,
      date: String(data.get("date")),
      time: String(data.get("time")),
      notes: String(data.get("notes")).trim()
    };
    const tags = data.getAll("tags");
    if (tags.some((tag) => !availableTags.includes(tag))) {
      showError(new Error("Your tags changed. Please select your tags again."));
      return;
    }
    saving = true;
    submit.disabled = true;
    clearError();
    try {
      if (tags.length) await saveSharedPlan(client, user, plan, tags);
      else await client.dbApi.addDoc(plansRef(client, user.uid), plan);
      location.assign(`${url()}?date=${encodeURIComponent(plan.date)}`);
    } catch (error) {
      showError(error);
      saving = false;
      submit.disabled = false;
    }
  };
  return () => { stop(); submit.disabled = true; form.onsubmit = null; };
});
