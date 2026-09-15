import { Trans, useTranslation } from "react-i18next";
import { UserCard } from "./components/UserCard";

export function App() {
  const { t } = useTranslation();

  return (
    <main className="app">
      <h1>Welcome to Acme</h1>
      <p>{t("intro")}</p>

      {/* Already handled by a translation helper — should not be reported. */}
      <Trans>Already translated via component</Trans>

      <button type="button" onClick={() => alert("clicked")}>
        Save changes
      </button>

      <label>
        Email address
        <input type="email" placeholder="you@example.com" aria-label="Email address" />
      </label>

      <a href="/help" title="Acme Corp">
        Learn more
      </a>

      <UserCard name="Ada" />
    </main>
  );
}
