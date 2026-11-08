import React, { useState } from 'react';

interface MobileDeviceGateProps {
  onBypass?: () => void;
}

export const MobileDeviceGate: React.FC<MobileDeviceGateProps> = ({ onBypass }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div
      dir="ltr"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-y-auto bg-slate-950 px-5 py-8 text-slate-100"
    >
      {/* Halo lumineux ambiant */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col items-center text-center">
        {/* Badge d'en-tête scientifique */}
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3.5 py-1 text-xs font-semibold text-sky-400">
          <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
          <span>LABORATOIRE VIRTUEL 3D · THERMOLAB</span>
        </div>

        {/* Illustration Ordinateur portable + Souris */}
        <div className="relative my-4 flex h-28 w-28 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl shadow-sky-950/40">
          <svg
            className="h-16 w-16 text-sky-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Écran d'ordinateur portable */}
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <line x1="2" y1="20" x2="22" y2="20" />
            <line x1="8" y1="16" x2="16" y2="16" />
            {/* Courbe thermodynamique sur l'écran */}
            <path d="M7 11l3-3 2 2 4-4" stroke="#38bdf8" strokeWidth="1.8" />
          </svg>
          {/* Badge Souris flottante */}
          <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-300 shadow">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="6" y="3" width="12" height="18" rx="6" />
              <line x1="12" y1="7" x2="12" y2="11" />
            </svg>
          </div>
        </div>

        {/* Titre principal en Français */}
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          Veuillez ouvrir la simulation sur un ordinateur
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">
          Bienvenue sur <strong className="text-white font-semibold">ThermoLab 3D</strong> ! Cette
          simulation d&apos;ingénierie avancée se déroule dans un environnement immersif complet en
          vue subjective (First-Person).
        </p>

        <p className="mt-2 text-xs leading-relaxed text-slate-400 sm:text-sm">
          Elle nécessite impérativement une <strong className="text-sky-300">souris</strong> pour le
          contrôle libre de la caméra à 360° ainsi qu&apos;un{' '}
          <strong className="text-sky-300">clavier (touches ZQSD / WASD)</strong> pour se déplacer
          librement dans le laboratoire, manipuler les appareils et analyser les grands écrans de
          mesures.
        </p>

        {/* Grille des prérequis matériels */}
        <div className="mt-5 grid w-full grid-cols-2 gap-2 text-left text-xs text-slate-300">
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
            <span className="text-base">🖱️</span>
            <div>
              <div className="font-bold text-slate-100">Contrôle Souris</div>
              <div className="text-[11px] text-slate-400">Visée libre 360° (Pointer Lock)</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
            <span className="text-base">⌨️</span>
            <div>
              <div className="font-bold text-slate-100">Clavier Complet</div>
              <div className="text-[11px] text-slate-400">Déplacement ZQSD / WASD</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
            <span className="text-base">🖥️</span>
            <div>
              <div className="font-bold text-slate-100">Grand Écran</div>
              <div className="text-[11px] text-slate-400">Relevés & diagrammes 0–30 min</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
            <span className="text-base">🤖</span>
            <div>
              <div className="font-bold text-slate-100">Robot TARS</div>
              <div className="text-[11px] text-slate-400">Activation interactive au clic</div>
            </div>
          </div>
        </div>

        {/* Bouton de copie du lien pour ouverture sur PC */}
        <div className="mt-6 flex w-full flex-col gap-2.5">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-3 font-semibold text-white shadow-lg shadow-sky-500/25 transition-all hover:from-sky-400 hover:to-blue-500 active:scale-[0.98]"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>
              {copied
                ? 'Lien copié dans le presse-papiers ! ✓'
                : 'Copier le lien pour l’ouvrir sur votre ordinateur'}
            </span>
          </button>

          {/* Option expérimentale pour développeurs */}
          {onBypass && (
            <button
              type="button"
              onClick={onBypass}
              className="mt-1 text-center text-xs text-slate-500 underline transition hover:text-slate-300"
            >
              Continuer quand même (mode expérimental développeur)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
