import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IS_DEV_BUILD } from "../config/appConfig";
import { Modal } from "./ui";

function AppUpdatePrompt() {
  const [registration, setRegistration] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const hasReloadedRef = useRef(false);
  const fallbackReloadRef = useRef(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (IS_DEV_BUILD) return undefined;

    const handleUpdateAvailable = (event) => {
      if (event.detail?.registration) {
        setRegistration(event.detail.registration);
      }
    };

    const handleControllerChange = () => {
      if (hasReloadedRef.current) return;
      hasReloadedRef.current = true;
      window.location.reload();
    };

    window.addEventListener("app-update-available", handleUpdateAvailable);
    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      handleControllerChange,
    );

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((readyRegistration) => {
          if (
            readyRegistration.waiting &&
            navigator.serviceWorker.controller
          ) {
            setRegistration(readyRegistration);
          }
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener("app-update-available", handleUpdateAvailable);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      if (fallbackReloadRef.current) {
        clearTimeout(fallbackReloadRef.current);
      }
    };
  }, []);

  const applyUpdate = () => {
    setIsApplying(true);

    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      fallbackReloadRef.current = setTimeout(() => {
        window.location.reload();
      }, 2000);
      return;
    }

    window.location.reload();
  };

  return (
    <Modal
      isOpen={!!registration}
      onClose={() => {
        if (!isApplying) setRegistration(null);
      }}
      title={t("app_update_available_title")}
      size="sm"
    >
      <div className="space-y-5 p-1">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
          <p className="text-sm font-semibold leading-relaxed text-emerald-800 dark:text-emerald-200">
            {t("app_update_available_description")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-600 transition-colors disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300"
            onClick={() => setRegistration(null)}
            disabled={isApplying}
          >
            {t("later")}
          </button>
          <button
            type="button"
            className="rounded-xl bg-emerald-500 py-3 text-xs font-bold text-white transition-colors disabled:opacity-60"
            onClick={applyUpdate}
            disabled={isApplying}
          >
            {isApplying ? t("reloading") : t("reload_and_update")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default AppUpdatePrompt;
