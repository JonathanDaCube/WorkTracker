"use strict";

const STORAGE_KEY = "daybook-plans-v1";
const THEME_KEY = "daybook-theme-v1";
const $ = (selector) => document.querySelector(selector);
const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const today = () => localDate(new Date());
let selectedDate = today();
let displayedMonth = new Date(parseDate(selectedDate).getFullYear(), parseDate(selectedDate).getMonth(), 1);
let plans = [];
let storageAvailable = true;

function showStorageError(message) {
  const banner = $("#storage-error");
  banner.textContent = message;
  banner.hidden = false;
}

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Invalid saved plans");
    plans = parsed;
  }
} catch (error) {
  storageAvailable = false;
  showStorageError("Your saved plans could not be loaded. Saving is disabled to avoid overwriting them.");
}

const themeSelect = $("#theme");
let currentTheme = "system";
try {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (["system", "light", "dark"].includes(savedTheme)) currentTheme = savedTheme;
} catch (error) {
  showStorageError("Your appearance setting could not be loaded.");
}
themeSelect.value = currentTheme;
document.documentElement.dataset.theme = currentTheme;
themeSelect.addEventListener("change", () => {
  try {
    localStorage.setItem(THEME_KEY, themeSelect.value);
    currentTheme = themeSelect.value;
    document.documentElement.dataset.theme = currentTheme;
  } catch (error) {
    themeSelect.value = currentTheme;
    showStorageError("Your appearance setting could not be saved.");
  }
});

function savePlans(nextPlans) {
  if (!storageAvailable) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPlans));
    plans = nextPlans;
    return true;
  } catch (error) {
    showStorageError("Your changes could not be saved. Check your browser storage settings and try again.");
    return false;
  }
}

function showPage() {
  const page = location.hash === "#add" ? "add" : "home";
  $("#home-page").hidden = page !== "home";
  $("#add-page").hidden = page !== "add";
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    const active = link.dataset.pageLink === page;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.title = `${page === "add" ? "Add a plan" : "Overview"} — Daybook`;
}

function formatTime(time) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function sorted(items) {
  return [...items].sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99") || a.title.localeCompare(b.title));
}

function makePlanItem(plan, detailed = false) {
  const item = document.createElement("article");
  item.className = "plan-item";
  const date = parseDate(plan.date);
  const tile = document.createElement("div");
  tile.className = `date-tile ${plan.type === "event" ? "event" : ""}`;
  const month = document.createElement("span");
  month.textContent = date.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
  const day = document.createElement("strong");
  day.textContent = date.getDate();
  tile.append(month, day);
  const content = document.createElement("div");
  content.className = "plan-content";
  const title = document.createElement("strong");
  title.textContent = plan.title;
  const meta = document.createElement("div");
  meta.className = "plan-meta";
  const badge = document.createElement("span");
  badge.className = `type-badge ${plan.type === "event" ? "event" : ""}`;
  badge.textContent = plan.type;
  meta.append(badge);
  if (plan.time) meta.append(document.createTextNode(`  ·  ${formatTime(plan.time)}`));
  content.append(title, meta);
  if (detailed && plan.notes) {
    const notes = document.createElement("p");
    notes.className = "plan-notes";
    notes.textContent = plan.notes;
    content.append(notes);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "delete-button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `Delete ${plan.title}`);
  remove.addEventListener("click", () => {
    if (!confirm(`Delete "${plan.title}"?`)) return;
    if (savePlans(plans.filter((entry) => entry.id !== plan.id))) {
      render();
      $("#announcement").textContent = `${plan.title} deleted.`;
    }
  });
  item.append(tile, content, remove);
  return item;
}

function renderUpcoming() {
  const upcoming = sorted(plans.filter((plan) => plan.date >= today()));
  $("#upcoming-count").textContent = upcoming.length;
  $("#assignment-count").textContent = upcoming.filter((plan) => plan.type === "assignment").length;
  $("#event-count").textContent = upcoming.filter((plan) => plan.type === "event").length;
  const list = $("#upcoming-list");
  list.replaceChildren();
  if (!upcoming.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "✳";
    const title = document.createElement("strong");
    title.textContent = "No upcoming plans";
    const text = document.createElement("p");
    text.textContent = "Add an assignment or event to get started.";
    const link = document.createElement("a");
    link.href = "#add";
    link.textContent = "Add a plan";
    empty.append(icon, title, text, link);
    list.append(empty);
  } else {
    upcoming.forEach((plan) => list.append(makePlanItem(plan)));
  }
}

function renderCalendar() {
  $("#calendar-month").textContent = displayedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const grid = $("#calendar-grid");
  grid.replaceChildren();
  const firstDay = (displayedMonth.getDay() + 6) % 7;
  const days = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement("span");
    blank.className = "calendar-blank";
    grid.append(blank);
  }
  for (let day = 1; day <= days; day++) {
    const date = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), day);
    const key = localDate(date);
    const dayPlans = plans.filter((plan) => plan.date === key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `calendar-day${key === today() ? " today" : ""}${key === selectedDate ? " selected" : ""}`;
    button.setAttribute("aria-label", `${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${dayPlans.length} ${dayPlans.length === 1 ? "plan" : "plans"}`);
    button.setAttribute("aria-pressed", String(key === selectedDate));
    button.textContent = day;
    const dots = document.createElement("span");
    dots.className = "day-dots";
    for (const type of ["assignment", "event"]) {
      if (dayPlans.some((plan) => plan.type === type)) {
        const dot = document.createElement("i");
        dot.className = `${type}-dot`;
        dots.append(dot);
      }
    }
    button.append(dots);
    button.addEventListener("click", () => {
      selectedDate = key;
      renderCalendar();
      grid.querySelector('[aria-pressed="true"]').focus();
    });
    grid.append(button);
  }
  $("#selected-date").textContent = parseDate(selectedDate).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const dayList = $("#day-list");
  dayList.replaceChildren();
  const selectedPlans = sorted(plans.filter((plan) => plan.date === selectedDate));
  if (!selectedPlans.length) {
    const empty = document.createElement("p");
    empty.className = "day-empty";
    empty.textContent = "No plans for this day.";
    dayList.append(empty);
  } else {
    selectedPlans.forEach((plan) => dayList.append(makePlanItem(plan, true)));
  }
}

function render() {
  renderUpcoming();
  renderCalendar();
}

$("#previous-month").addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
  selectedDate = localDate(displayedMonth);
  renderCalendar();
});
$("#next-month").addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
  selectedDate = localDate(displayedMonth);
  renderCalendar();
});
$("#plan-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const title = String(data.get("title")).trim();
  if (!title) {
    $("#title").setCustomValidity("Please enter a name for your plan.");
    $("#title").reportValidity();
    return;
  }
  const plan = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: String(data.get("type")),
    title,
    date: String(data.get("date")),
    time: String(data.get("time")),
    notes: String(data.get("notes")).trim()
  };
  if (!savePlans([...plans, plan])) return;
  selectedDate = plan.date;
  const date = parseDate(plan.date);
  displayedMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  form.reset();
  render();
  $("#announcement").textContent = `${plan.title} saved.`;
  location.hash = "home";
});
$("#title").addEventListener("input", (event) => event.currentTarget.setCustomValidity(""));
window.addEventListener("hashchange", showPage);
showPage();
render();
