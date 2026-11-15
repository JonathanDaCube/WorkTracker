import { setupPlanner } from "./shared.js";
import { plansRef, showError, clearError, url } from "./firebase-client.js";
import { subscribeTags, saveSharedPlan } from "./tags.js";

const form = document.querySelector("#plan-form");
const title = document.querySelector("#title");
title.addEventListener("input", () => title.setCustomValidity(""));

setupPlanner((client, user) => {
  const submit = form.querySelector('button[type="submit"]');
  const applied = document.querySelector("#applied-tags");
  const available = document.querySelector("#available-tags");
  let availableTags = [];
  const selectedTags = new Set();
  let saving = false;
  const renderTags = (focusTag) => {
    applied.replaceChildren();
    available.replaceChildren();
    let focusButton;
    for (const tag of availableTags) {
      const selected = selectedTags.has(tag);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tag-option";
      button.textContent = tag;
      button.disabled = saving;
      button.setAttribute("aria-label", `${selected ? "Remove" : "Apply"} tag ${tag}`);
      button.addEventListener("click", () => {
        if (selectedTags.has(tag)) selectedTags.delete(tag);
        else selectedTags.add(tag);
        renderTags(tag);
      });
      (selected ? applied : available).append(button);
      if (tag === focusTag) focusButton = button;
    }
    for (const group of [applied, available]) {
      if (!group.hasChildNodes()) {
        const empty = document.createElement("span");
        empty.textContent = "None";
        group.append(empty);
      }
    }
    if (focusButton) focusButton.focus();
  };
  const stop = subscribeTags(client, user, (tags) => {
    availableTags = tags;
    let removed = false;
    for (const tag of selectedTags) {
      if (!tags.includes(tag)) {
        selectedTags.delete(tag);
        removed = true;
      }
    }
    if (removed) showError(new Error("An applied tag is no longer available and was removed."));
    renderTags();
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
    const tags = availableTags.filter((tag) => selectedTags.has(tag));
    saving = true;
    submit.disabled = true;
    renderTags();
    clearError();
    try {
      if (tags.length) await saveSharedPlan(client, user, plan, tags);
      else await client.dbApi.addDoc(plansRef(client, user.uid), plan);
      location.assign(`${url()}?date=${encodeURIComponent(plan.date)}`);
    } catch (error) {
      showError(error);
      saving = false;
      submit.disabled = false;
      renderTags();
    }
  };
  return () => { stop(); submit.disabled = true; form.onsubmit = null; };
});
