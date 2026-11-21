import { Outlet } from "react-router-dom";
import { ChipButton, ChipLink } from "./ui/Chips";
import { LANG_LABEL, LANGS, usePrefs, useT } from "../lib/i18n";
import { BrandMark } from "./BrandMark";

export function AppShell() {
  const { t } = useT();
  const { lang, setLang, scheme, setScheme } = usePrefs();

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <a
        href="#content"
        className="sr-only z-50 rounded-control bg-ink px-3 py-2 text-on-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("shell.skip")}
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-paper">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
          <BrandMark to="/" />
          <nav aria-label={t("shell.nav")} className="order-3 -mx-1 flex w-full gap-2 overflow-x-auto px-1 pb-0.5 md:order-none md:w-auto md:overflow-visible">
            <ChipLink to="/console" end>
              {t("nav.overview")}
            </ChipLink>
            <ChipLink to="/console/episodes">{t("nav.episodes")}</ChipLink>
            <ChipLink to="/console/live">{t("nav.live")}</ChipLink>
            <ChipLink to="/console/agents">{t("nav.agents")}</ChipLink>
            <ChipLink to="/console/method">{t("nav.method")}</ChipLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div role="group" aria-label={t("shell.lang")} className="flex gap-1">
              {LANGS.map((code) => (
                <ChipButton key={code} active={lang === code} onClick={() => setLang(code)} label={t(`lang.${code}`)}>
                  {LANG_LABEL[code]}
                </ChipButton>
              ))}
            </div>
            <ChipButton
              active={scheme === "alt"}
              onClick={() => setScheme(scheme === "alt" ? "default" : "alt")}
              label={t("shell.scheme.label")}
            >
              <span className="inline-flex items-center gap-1" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-finding" />
                <span className="h-2 w-2 rounded-full bg-evidence" />
              </span>
              <span className="hidden sm:inline">{scheme === "alt" ? t("shell.scheme.alt") : t("shell.scheme.default")}</span>
            </ChipButton>
          </div>
        </div>
      </header>

      <main id="content" className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-line px-4 py-4 text-[13px] text-ink-muted sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{t("shell.footer")}</span>
          <span className="flex gap-4">
            <a href="/" className="link text-ink-muted">
              {t("shell.landing")}
            </a>
            <a href="https://github.com/Aibek-S/auditgym" className="link text-ink-muted" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

