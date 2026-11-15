import { connectFirebase, url, profileRef, showError, clearError, legacyAppearance } from "./firebase-client.js";

const signup = document.body.dataset.page === "signup";
const form = document.querySelector("#auth-form");
const google = document.querySelector("#google-auth");
const submit = form.querySelector('button[type="submit"]');

function busy(value) {
  submit.disabled = value;
  google.disabled = value;
  const finish = document.querySelector("#finish-signup");
  if (finish) finish.disabled = value;
}

async function start() {
  let client;
  try {
    client = await connectFirebase();
  } catch (error) {
    showError(error);
    return;
  }
  let processing = false;
  const profile = (user) => profileRef(client, user.uid);
  const hasProfile = async (user) => (await client.dbApi.getDoc(profile(user))).exists();
  const showCompletion = () => {
    document.querySelector("#signup-options").hidden = true;
    document.querySelector("#complete-signup").hidden = false;
  };
  const goForUser = async (user) => {
    if (await hasProfile(user)) location.replace(url());
    else if (signup) showCompletion();
    else location.replace(url("signup/"));
  };
  const finishSignup = async (user) => {
    await client.dbApi.setDoc(profile(user), { appearance: legacyAppearance() }, { merge: true });
    location.replace(url());
  };
  client.authApi.onAuthStateChanged(client.auth, async (user) => {
    if (processing) return;
    try {
      if (user) await goForUser(user);
      else if (signup) {
        document.querySelector("#signup-options").hidden = false;
        document.querySelector("#complete-signup").hidden = true;
      }
      busy(false);
    } catch (error) {
      showError(error);
    }
  }, showError);
  const run = async (action) => {
    processing = true;
    busy(true);
    clearError();
    try {
      await action();
    } catch (error) {
      showError(error);
      if (signup && client.auth.currentUser) showCompletion();
    } finally {
      processing = false;
      busy(false);
    }
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const email = document.querySelector("#email").value.trim();
      const password = document.querySelector("#password").value;
      if (signup) {
        const result = await client.authApi.createUserWithEmailAndPassword(client.auth, email, password);
        await finishSignup(result.user);
      } else {
        const result = await client.authApi.signInWithEmailAndPassword(client.auth, email, password);
        await goForUser(result.user);
      }
    });
  });
  google.addEventListener("click", () => run(async () => {
    const result = await client.authApi.signInWithPopup(client.auth, new client.authApi.GoogleAuthProvider());
    await goForUser(result.user);
  }));
  if (signup) {
    document.querySelector("#finish-signup").addEventListener("click", () => run(async () => {
      if (!client.auth.currentUser) throw new Error("Please sign in again to complete signup.");
      await finishSignup(client.auth.currentUser);
    }));
    document.querySelector("#cancel-signup").addEventListener("click", () => run(async () => {
      await client.authApi.signOut(client.auth);
      document.querySelector("#signup-options").hidden = false;
      document.querySelector("#complete-signup").hidden = true;
    }));
  }
}

start();
