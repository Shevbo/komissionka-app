type RunControllerMap = Map<string, AbortController>;

declare global {
  var __testRunControllers__: RunControllerMap | undefined;
}

function store(): RunControllerMap {
  if (!globalThis.__testRunControllers__) globalThis.__testRunControllers__ = new Map<string, AbortController>();
  return globalThis.__testRunControllers__;
}

export function registerTestRunController(runId: string, controller: AbortController): void {
  store().set(runId, controller);
}

export function unregisterTestRunController(runId: string): void {
  store().delete(runId);
}

export function abortTestRunController(runId: string): boolean {
  const c = store().get(runId);
  if (!c) return false;
  c.abort();
  return true;
}

