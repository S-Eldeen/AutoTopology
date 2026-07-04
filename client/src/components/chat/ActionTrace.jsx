import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  FileText,
  Terminal,
  Wrench,
} from 'lucide-react';

function traceTitle(tool) {
  return {
    generate_topology: 'Topology generation',
    edit_topology: 'Topology edit',
    export_project: 'Deployment export',
    search_kb: 'Knowledge search',
  }[tool] || 'Action trace';
}

function StepIcon({ step }) {
  const className = step.status === 'error'
    ? 'text-red-300'
    : step.status === 'running'
      ? 'text-emerald-300 animate-spin'
      : 'text-emerald-300';

  if (step.status === 'error') return <AlertCircle size={15} className={className} />;
  if (step.status === 'running') return <CircleDashed size={15} className={className} />;
  if (step.kind === 'done') return <CheckCircle2 size={15} className={className} />;
  if (step.kind === 'script') return <Terminal size={15} className="text-sky-300" />;
  if (step.kind === 'phase') return <FileText size={15} className="text-violet-300" />;
  return <Wrench size={15} className="text-zinc-300" />;
}

function detailLabel(step) {
  if (step.kind === 'script') return 'Script';
  if (step.kind === 'phase') return 'Details';
  if (step.kind === 'done') return step.status === 'error' ? 'Error' : 'Summary';
  return 'Details';
}

function TraceRow({ step, isLast }) {
  const [open, setOpen] = useState(false);
  const hasDetail = step.detail && step.detail !== step.label;

  return (
    <div className="relative flex gap-3">
      {!isLast && (
        <div className="absolute left-[15px] top-8 h-[calc(100%-16px)] w-px bg-zinc-700/80" />
      )}
      <div className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950">
        <StepIcon step={step} />
      </div>
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex min-h-8 flex-wrap items-center gap-2">
          <span className="truncate text-sm text-zinc-100">{step.label}</span>
          {step.status === 'running' && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
          {hasDetail && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-zinc-300 hover:border-zinc-600 hover:text-white"
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {detailLabel(step)}
            </button>
          )}
        </div>
        {open && hasDetail && (
          <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-zinc-800 bg-black/30 p-3 text-xs leading-relaxed text-zinc-300">
            <code>{step.detail}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

export default function ActionTrace({ trace, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!trace?.steps?.length) return null;

  const isComplete = trace.status === 'complete' || trace.status === 'error';

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
        <span className="text-sm font-semibold text-zinc-100">{traceTitle(trace.tool)}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
          trace.status === 'error'
            ? 'bg-red-500/10 text-red-300'
            : isComplete
              ? 'bg-emerald-500/10 text-emerald-300'
              : 'bg-zinc-800 text-zinc-300'
        }`}>
          {trace.status === 'error' ? 'Failed' : isComplete ? 'Done' : 'Running'}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3">
          {trace.steps.map((step, index) => (
            <TraceRow
              key={step.id || `${step.label}-${index}`}
              step={step}
              isLast={index === trace.steps.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
