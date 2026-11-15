import { setupPlanner } from "./shared.js";
import { plansRef, showError, clearError, url } from "./firebase-client.js";

const form = document.querySelector("#plan-form");
const title = document.querySelector("#title");
title.addEventListener("input", () => title.setCustomValidity(""));

setupPlanner((client, user) => {
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = false;
  form.onsubmit = async (event) => {
    event.preventDefault();
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
    submit.disabled = true;
    clearError();
    try {
      await client.dbApi.addDoc(plansRef(client, user.uid), plan);
      location.assign(`${url()}?date=${encodeURIComponent(plan.date)}`);
    } catch (error) {
      showError(error);
      submit.disabled = false;
    }
  };
  return () => { submit.disabled = true; form.onsubmit = null; };
});
