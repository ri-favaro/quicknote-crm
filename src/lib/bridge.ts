import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type DockAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface DockShortcuts {
  toggle: string;
  newNote: string;
}

export interface DockState {
  anchor: DockAnchor;
  alwaysOnTop: boolean;
  visible: boolean;
  shortcuts: DockShortcuts;
}

export interface ActiveProfile {
  authorId: string;
  authorName: string;
  token: string;
}

export interface DealSummary {
  id: number;
  title: string;
  orgName?: string;
}

export interface DispatchResult {
  logId: string;
  status: "sent" | "error";
  message: string;
}

const DEFAULT_DOCK_STATE: DockState = {
  anchor: "top-right",
  alwaysOnTop: true,
  visible: true,
  shortcuts: {
    toggle: "Alt+Space",
    newNote: "Ctrl+Shift+N",
  },
};

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getDockState(): Promise<DockState> {
  if (!isTauriRuntime()) {
    return DEFAULT_DOCK_STATE;
  }
  return invoke<DockState>("get_dock_state");
}

export async function snapDock(anchor: DockAnchor): Promise<DockState> {
  if (!isTauriRuntime()) {
    return { ...DEFAULT_DOCK_STATE, anchor };
  }
  return invoke<DockState>("snap_dock", { anchor });
}

export async function setAlwaysOnTop(enabled: boolean): Promise<DockState> {
  if (!isTauriRuntime()) {
    return { ...DEFAULT_DOCK_STATE, alwaysOnTop: enabled };
  }
  return invoke<DockState>("set_always_on_top", { enabled });
}

export async function hideDock(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke("hide_dock");
}

export async function onDockNewNote(handler: () => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  return listen("dock://new-note", () => handler());
}

export async function onDockStateChanged(
  handler: (state: DockState) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  return listen<DockState>("dock://state-changed", (event) => {
    handler(event.payload);
  });
}