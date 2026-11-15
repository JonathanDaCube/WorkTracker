import { connectFirebase, url, profileRef, showError, clearError, removeLegacyPlans } from "./firebase-client.js";

export async function setupPlanner(onReady) {
  let client;
  try {
    client = await connectFirebase();
  } catch (error) {
    showError(error);
    return;
  }
  let stopProfile;
  let stopPage;
  let generation = 0;
  client.authApi.onAuthStateChanged(client.auth, async (user) => {
    const currentGeneration = ++generation;
    if (stopProfile) stopProfile();
    if (stopPage) stopPage();
    stopProfile = stopPage = undefined;
    if (!user) {
      location.replace(url("signin/"));
      return;
    }
    try {
      const profile = await client.dbApi.getDoc(profileRef(client, user.uid));
      if (currentGeneration !== generation) return;
      if (!profile.exists()) {
        location.replace(url("signup/"));
        return;
      }
      removeLegacyPlans();
      document.querySelector("#account").textContent = user.email || "Signed in";
      const theme = document.querySelector("#theme");
      stopProfile = client.dbApi.onSnapshot(profileRef(client, user.uid), (snapshot) => {
        if (!snapshot.exists()) {
          location.replace(url("signup/"));
          return;
        }
        const appearance = snapshot.data().appearance;
        const value = ["system", "light", "dark"].includes(appearance) ? appearance : "system";
        theme.value = value;
        document.documentElement.dataset.theme = value;
      }, showError);
      theme.onchange = async () => {
        const oldValue = document.documentElement.dataset.theme || "system";
        theme.disabled = true;
        try {
          await client.dbApi.updateDoc(profileRef(client, user.uid), { appearance: theme.value });
          clearError();
        } catch (error) {
          theme.value = oldValue;
          showError(error);
        } finally {
          theme.disabled = false;
        }
      };
      document.querySelector("#signout").onclick = async () => {
        try {
          await client.authApi.signOut(client.auth);
        } catch (error) {
          showError(error);
        }
      };
      stopPage = onReady(client, user);
    } catch (error) {
      if (currentGeneration === generation) showError(error);
    }
  }, showError);
}
