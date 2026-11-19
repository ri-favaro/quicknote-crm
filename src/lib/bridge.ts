import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type DockEdge = "right" | "left" | "top";

export interface DockShortcuts {
  toggle: string;
  newNote: string;
}

export interface DockState {
  edge: DockEdge;
  expanded: boolean;
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

let mockDockState: DockState = {
  edge: "right",
  expanded: false,
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
    return { ...mockDockState };
  }
  return invoke<DockState>("get_dock_state");
}

export async function setDockEdge(edge: DockEdge): Promise<DockState> {
  if (!isTauriRuntime()) {
    mockDockState = { ...mockDockState, edge };
    return { ...mockDockState };
  }
  return invoke<DockState>("set_dock_edge", { edge });
}

export async function setDockExpanded(expanded: boolean): Promise<DockState> {
  if (!isTauriRuntime()) {
    mockDockState = { ...mockDockState, expanded, visible: expanded ? true : mockDockState.visible };
    return { ...mockDockState };
  }
  return invoke<DockState>("set_dock_expanded", { expanded });
}

export async function toggleDockExpanded(): Promise<DockState> {
  if (!isTauriRuntime()) {
    mockDockState = { ...mockDockState, expanded: !mockDockState.visible ? true : !mockDockState.expanded, visible: true };
    return { ...mockDockState };
  }
  return invoke<DockState>("toggle_dock_expanded");
}

export async function setAlwaysOnTop(enabled: boolean): Promise<DockState> {
  if (!isTauriRuntime()) {
    mockDockState = { ...mockDockState, alwaysOnTop: enabled };
    return { ...mockDockState };
  }
  return invoke<DockState>("set_always_on_top", { enabled });
}

export async function hideDock(): Promise<void> {
  if (!isTauriRuntime()) {
    mockDockState = { ...mockDockState, visible: false };
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