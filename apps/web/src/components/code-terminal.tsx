'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

export interface CodeTerminalTab {
  key: string;
  label: string;
  filename: string;
  code: string;
}

export function CodeTerminal({
  tabs,
  activeKey,
  onActiveChange,
  extraActions,
  isRTL = false,
}: {
  tabs: CodeTerminalTab[];
  activeKey?: string;
  onActiveChange?: (key: string) => void;
  extraActions?: ReactNode;
  isRTL?: boolean;
}) {
  const [internalKey, setInternalKey] = useState(tabs[0]?.key ?? '');
  const [copied, setCopied] = useState(false);

  const selectedKey = activeKey ?? internalKey;
  const active = tabs.find((tab) => tab.key === selectedKey) ?? tabs[0];

  const select = (key: string) => {
    if (onActiveChange) onActiveChange(key);
    else setInternalKey(key);
  };

  const handleCopy = () => {
    if (!active) return;
    navigator.clipboard.writeText(active.code);
    setCopied(true);
    toast.success(isRTL ? 'کد کپی شد' : 'Code copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2">
      {tabs.length > 1 && (
        <div className="w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/50 text-xs min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => select(tab.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 ${
                  active?.key === tab.key
                    ? 'bg-background text-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
            {extraActions}
          </div>
        </div>
      )}

      {active && (
        <div
          className="rounded-xl border border-zinc-800 bg-[#0d1117] text-zinc-100 overflow-hidden shadow-md text-left"
          dir="ltr"
        >
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/95 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80 inline-block" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80 inline-block" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 inline-block" />
              </div>
              <span className="text-zinc-300 font-sans font-medium text-xs truncate">
                {active.filename}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all active:scale-95 shrink-0 ${
                copied
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 hover:text-white'
              }`}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">{isRTL ? 'کپی شد!' : 'Copied!'}</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>{isRTL ? 'کپی کد' : 'Copy'}</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-3 text-[11px] font-mono leading-relaxed overflow-x-auto text-zinc-200 selection:bg-primary/30 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <code>{active.code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
