import { useEffect } from "react";
import { useApp } from "./context/AppContext.js";
import { usePeerManager } from "./hooks/usePeerManager.js";
import { Layout } from "./components/Layout.js";
import { OnboardingPage } from "./pages/OnboardingPage.js";
import { UnlockPage } from "./pages/UnlockPage.js";
import { HomePage } from "./pages/HomePage.js";
import { ConversationPage } from "./pages/ConversationPage.js";
import { AddContactPage } from "./pages/AddContactPage.js";

export function App() {
  const { state } = useApp();

  // Request OS notification permission on mount (Electron auto-grants, but correct practice)
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  // Show total unread count in window title
  useEffect(() => {
    const total = Object.values(state.unreadCounts).reduce((sum, n) => sum + n, 0);
    document.title = total > 0 ? `(${total}) Null` : "Null";
  }, [state.unreadCounts]);

  // PeerManager lifecycle — starts when wallet is unlocked, cleans up on unmount
  const pmRef = usePeerManager();

  // ── Pre-wallet screens ────────────────────────────────────────────────────

  if (state.screen === "loading") {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
          fontSize: "12px",
          letterSpacing: "0.2em",
        }}
      >
        loading...
      </div>
    );
  }

  if (state.screen === "onboarding") {
    return <OnboardingPage />;
  }

  if (state.screen === "unlock") {
    return <UnlockPage />;
  }

  // ── Authenticated screens (wallet unlocked) ────────────────────────────────

  return (
    <Layout>
      {state.screen === "home" && <HomePage />}

      {state.screen === "conversation" && state.currentContactAddress && (
        <ConversationPage
          contactAddress={state.currentContactAddress}
          pmRef={pmRef}
        />
      )}

      {state.screen === "add-contact" && <AddContactPage />}
    </Layout>
  );
}
