"use client";

import { useEffect, useRef, useState } from "react";
import {
  isRiskProfileId,
  RISK_PROFILE_IDS,
  RISK_PROFILES,
  type RiskProfile,
  type RiskProfileId,
} from "@/lib/risk";

/**
 * The risk profile: from the URL if it names one, else the saved choice. `onApply` runs
 * when the saved choice arrives and whenever the user picks one, so a page can set its
 * filters to match. It doesn't run for a profile from the URL, whose filters came with it.
 */
export function useRiskProfile(
  urlValue: string | null,
  onApply: (profile: RiskProfile, source: "saved" | "picked") => void,
) {
  const fromUrl = isRiskProfileId(urlValue) ? urlValue : null;
  const [id, setId] = useState<RiskProfileId>(fromUrl ?? "safe");
  const apply = useRef(onApply);
  useEffect(() => {
    apply.current = onApply;
  });

  useEffect(() => {
    if (fromUrl) return;
    let stop = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { riskProfile?: unknown } | null) => {
        if (stop || !isRiskProfileId(s?.riskProfile)) return;
        setId(s.riskProfile);
        apply.current(RISK_PROFILES[s.riskProfile], "saved");
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [fromUrl]);

  function choose(next: RiskProfileId) {
    setId(next);
    apply.current(RISK_PROFILES[next], "picked");
    void fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ riskProfile: next }),
    }).catch(() => {});
  }

  return { profile: RISK_PROFILES[id], choose };
}

export function RiskPicker({
  profile,
  onChange,
}: {
  profile: RiskProfile;
  onChange: (id: RiskProfileId) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="mb-1 text-muted">Risk level</legend>
      <div className="flex flex-wrap gap-2">
        {RISK_PROFILE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="btn"
            aria-pressed={profile.id === id}
            title={RISK_PROFILES[id].summary}
            onClick={() => onChange(id)}
          >
            {RISK_PROFILES[id].label}
          </button>
        ))}
      </div>
      <p className={profile.id === "aggressive" ? "text-bad" : "text-muted"}>
        {profile.summary}
      </p>
    </fieldset>
  );
}
