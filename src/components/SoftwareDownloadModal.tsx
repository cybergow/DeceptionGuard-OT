import React, { useState } from 'react';
import { MitigationConfig, ProtectedRegistry } from '../core/types';
import {
  CliCommandPreset,
  generateNodeCliScript,
  generatePortableInstallerBundle,
  generatePythonCliScript,
  simulateCliTerminalExecution,
} from '../core/softwarePackager';
import { usePWAInstall } from '../utils/usePWAInstall';

interface SoftwareDownloadCenterProps {
  registry: ProtectedRegistry;
  mitigationConfig: MitigationConfig;
  isModal?: boolean;
  onClose?: () => void;
}

function triggerFileDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const SoftwareDownloadCenter: React.FC<SoftwareDownloadCenterProps> = ({
  registry,
  mitigationConfig,
  isModal = false,
  onClose,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [selectedPreset, setSelectedPreset] = useState<CliCommandPreset>('audit-baseline');
  const [previewPackage, setPreviewPackage] = useState<'python' | 'node' | 'installer'>('python');
  const [installGuideVisible, setInstallGuideVisible] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  const terminalExecution = simulateCliTerminalExecution(
    selectedPreset,
    registry,
    mitigationConfig
  );

  const handleDownloadPython = () => {
    const code = generatePythonCliScript(registry, mitigationConfig);
    triggerFileDownload(code, 'deceptionguard_ot_cli.py', 'text/x-python;charset=utf-8;');
    setDownloadStatus('Downloaded deceptionguard_ot_cli.py');
    setTimeout(() => setDownloadStatus(null), 3500);
  };

  const handleDownloadNode = () => {
    const code = generateNodeCliScript(registry, mitigationConfig);
    triggerFileDownload(code, 'deceptionguard_ot_cli.mjs', 'application/javascript;charset=utf-8;');
    setDownloadStatus('Downloaded deceptionguard_ot_cli.mjs');
    setTimeout(() => setDownloadStatus(null), 3500);
  };

  const handleDownloadInstaller = () => {
    const script = generatePortableInstallerBundle(registry, mitigationConfig);
    triggerFileDownload(
      script,
      'install-deceptionguard-ot.sh',
      'application/x-sh;charset=utf-8;'
    );
    setDownloadStatus('Downloaded install-deceptionguard-ot.sh');
    setTimeout(() => setDownloadStatus(null), 3500);
  };

  const handlePwaInstall = async () => {
    if (isInstallable) {
      await install();
    } else {
      setInstallGuideVisible((v) => !v);
    }
  };

  const previewCode =
    previewPackage === 'python'
      ? generatePythonCliScript(registry, mitigationConfig)
      : previewPackage === 'node'
      ? generateNodeCliScript(registry, mitigationConfig)
      : generatePortableInstallerBundle(registry, mitigationConfig);

  const content = (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-200">
      {/* Header */}
      <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <div className="text-xs font-mono text-slate-500">
            Standalone Software Distribution · Desktop App (PWA) · CLI & Docker Bundles · v2.4.0
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Download & Install DeceptionGuard-OT Software
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Run DeceptionGuard-OT as an installed desktop application, execute the zero-dependency
            Python 3 or Node.js CLI auditor in your local terminal, or download the complete source
            code and isolated Docker lab tarball (10.240.0.0/24).
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {downloadStatus && (
            <span role="status" className="text-xs font-mono font-semibold text-emerald-700">
              {downloadStatus}
            </span>
          )}
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close software download modal"
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* 4 Software Distribution Options */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Option 1: Full Source & Docker Release Archive (.tar.gz) */}
        <div className="p-4 border border-slate-200 rounded-lg flex flex-col justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-slate-500">
              <span>Full Source + Docker</span>
              <span className="text-slate-900 font-semibold">.tar.gz</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              01. Complete Workspace Bundle
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Full TypeScript/React/Express codebase, unit tests, Dockerfile, isolated
              docker-compose.yml, GitHub Actions CI/CD, and Terraform IaC.
            </p>
          </div>
          <a
            href="/api/download/tarball"
            download="deceptionguard-ot-v2.4.0.tar.gz"
            onClick={() => setDownloadStatus('Downloading deceptionguard-ot-v2.4.0.tar.gz')}
            className="w-full py-2 px-3 text-center text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
          >
            Download Source (.tar.gz)
          </a>
        </div>

        {/* Option 2: Standalone Python 3 CLI Auditor */}
        <div className="p-4 border border-slate-200 rounded-lg flex flex-col justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-slate-500">
              <span>Python 3.10+ Stdlib</span>
              <span className="text-emerald-700 font-semibold">Zero-Dep CLI</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              02. Python 3 Standalone CLI
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Self-contained executable Python script (deceptionguard_ot_cli.py) pre-configured
              with your current Protected Registry and Mitigation policies.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadPython}
            className="w-full py-2 px-3 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap cursor-pointer"
          >
            Download Python CLI (.py)
          </button>
        </div>

        {/* Option 3: Self-Extracting Lab Installer & Node CLI */}
        <div className="p-4 border border-slate-200 rounded-lg flex flex-col justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-slate-500">
              <span>Linux / macOS / WSL</span>
              <span className="text-slate-900 font-semibold">Bash + Node</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              03. Lab Installer & Node CLI
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Self-extracting shell installer (install-deceptionguard-ot.sh) or standalone
              Node.js local honeypot server (deceptionguard_ot_cli.mjs).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownloadInstaller}
              className="py-2 px-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap cursor-pointer"
            >
              Installer (.sh)
            </button>
            <button
              type="button"
              onClick={handleDownloadNode}
              className="py-2 px-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap cursor-pointer"
            >
              Node CLI (.mjs)
            </button>
          </div>
        </div>

        {/* Option 4: Install Desktop / Offline PWA App */}
        <div className="p-4 border border-slate-200 rounded-lg flex flex-col justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-slate-500">
              <span>Desktop & Mobile</span>
              <span className="text-emerald-700 font-semibold">
                {isInstalled ? 'INSTALLED' : 'Offline Ready'}
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              04. Install Native Desktop App
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Install DeceptionGuard-OT as a standalone desktop or mobile application with full
              service-worker offline caching.
            </p>
          </div>
          {isInstalled ? (
            <div className="py-2 px-3 text-center text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded whitespace-nowrap">
              Running in Standalone Mode
            </div>
          ) : (
            <button
              type="button"
              onClick={handlePwaInstall}
              className="w-full py-2 px-3 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded transition-colors whitespace-nowrap cursor-pointer"
            >
              {isInstallable ? 'Install Desktop App Now' : 'Desktop App Install Guide'}
            </button>
          )}
        </div>
      </div>

      {/* Conditional Desktop / iOS PWA Installation Instructions */}
      {installGuideVisible && !isInstalled && (
        <div className="px-6 py-4 bg-slate-50 text-xs text-slate-700 space-y-2">
          <div className="flex items-center justify-between">
            <strong className="text-slate-900">
              How to Install DeceptionGuard-OT as a Standalone Desktop / Mobile Application:
            </strong>
            <button
              type="button"
              onClick={() => setInstallGuideVisible(false)}
              className="text-slate-600 underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          {isIOS ? (
            <p>
              On iPhone/iPad Safari: Tap the <strong>Share</strong> button in the browser toolbar,
              then select <strong>Add to Home Screen</strong>.
            </p>
          ) : (
            <p>
              In Chrome, Edge, or Brave Desktop: Click the <strong>Install DeceptionGuard-OT</strong>{' '}
              icon on the right side of the browser address bar (or open the browser menu{' '}
              <code className="font-mono">Save and share → Install page as app</code>), or
              download the standalone Python/Docker bundle above to run locally from your terminal.
            </p>
          )}
        </div>
      )}

      {/* Interactive Local CLI Simulator & Executable Code Inspector */}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 Cols: Interactive CLI Terminal Runner */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                Interactive CLI Verification Terminal
              </h3>
              <p className="text-[11px] text-slate-500">
                Preview how the downloaded CLI runs against your current registry and mitigations.
              </p>
            </div>
            <div
              role="group"
              aria-label="CLI Command Preset"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-md shrink-0"
            >
              {(
                [
                  ['audit-baseline', '--audit'],
                  ['compare-mitigation', '--compare'],
                  ['run-ablations', '--ablation'],
                  ['pytest-suite', '--test'],
                ] as const
              ).map(([presetKey, label]) => (
                <button
                  key={presetKey}
                  type="button"
                  onClick={() => setSelectedPreset(presetKey)}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedPreset === presetKey
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <pre className="p-4 bg-slate-900 text-slate-100 rounded-md text-[11px] font-mono overflow-x-auto leading-relaxed max-h-80">
            {terminalExecution.outputLines.join('\n')}
          </pre>
        </div>

        {/* Right 6 Cols: Downloadable Binary Source Inspector & Quick-Start */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                Downloadable Software Source Preview
              </h3>
              <p className="text-[11px] text-slate-500">
                Inspect the generated standalone executable before running locally.
              </p>
            </div>
            <div
              role="group"
              aria-label="Software Package Preview"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-md shrink-0"
            >
              {(
                [
                  ['python', 'Python CLI (.py)'],
                  ['node', 'Node CLI (.mjs)'],
                  ['installer', 'Installer (.sh)'],
                ] as const
              ).map(([pkgKey, label]) => (
                <button
                  key={pkgKey}
                  type="button"
                  onClick={() => setPreviewPackage(pkgKey)}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    previewPackage === pkgKey
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <pre className="p-4 bg-slate-900 text-slate-100 rounded-md text-[11px] font-mono overflow-x-auto leading-relaxed max-h-80">
            {previewCode}
          </pre>
        </div>
      </div>
    </div>
  );

  if (!isModal) {
    return content;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Download and Install DeceptionGuard-OT Software"
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
    >
      <div className="max-w-6xl w-full my-4 shadow-xl">{content}</div>
    </div>
  );
};
