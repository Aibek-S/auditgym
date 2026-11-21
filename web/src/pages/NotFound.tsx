import { useT } from "../lib/i18n";
import { ButtonLink } from "../components/ui/Button";

export function NotFound() {
  const { t } = useT();
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-sm">
        <p className="text-[13px] text-ink-muted">404</p>
        <h1 className="mt-2 text-[24px] font-medium text-ink">{t("notfound.title")}</h1>
        <p className="mt-2 text-[15px] text-ink-secondary">{t("notfound.body")}</p>
        <ButtonLink to="/console" variant="secondary" className="mt-5">
          {t("notfound.back")}
        </ButtonLink>
      </div>
    </div>
  );
}
