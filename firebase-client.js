import { firebaseConfig } from "./firebase-config.js";

export async function connectFirebase() {
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.appId) {
    throw new Error("Firebase is not configured. See the setup instructions in README.md.");
  }
  const [app, auth, db] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js")
  ]);
  const firebase = app.initializeApp(firebaseConfig);
  return { auth: auth.getAuth(firebase), db: db.getFirestore(firebase), authApi: auth, dbApi: db };
}

export const url = (path = "") => new URL(path, import.meta.url).href;
export const profileRef = (client, uid) => client.dbApi.doc(client.db, "users", uid);
export const plansRef = (client, uid) => client.dbApi.collection(client.db, "users", uid, "plans");
export function showError(error) {
  const banner = document.querySelector("#storage-error");
  banner.textContent = error instanceof Error ? error.message : String(error);
  banner.hidden = false;
}
export function clearError() {
  document.querySelector("#storage-error").hidden = true;
}
export function legacyAppearance() {
  try {
    const theme = localStorage.getItem("daybook-theme-v1");
    return ["system", "light", "dark"].includes(theme) ? theme : "system";
  } catch (error) {
    throw new Error("Could not read the previous appearance setting. Check your browser storage settings.");
  }
}
export function removeLegacyPlans() {
  try {
    localStorage.removeItem("daybook-plans-v1");
    localStorage.removeItem("daybook-theme-v1");
  } catch (error) {
    throw new Error("Could not remove the old browser data. Check your browser storage settings.");
  }
}
