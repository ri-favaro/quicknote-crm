import { afterEach, describe, expect, it, vi } from "vitest";
import type { DockState } from "./bridge";

const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

function setTauriInternals(enabled: boolean) {
  const target = window as unknown as Record<string, unknown>;
  if (enabled) {
    target.__TAURI_INTERNALS__ = {};
  } else {
    delete target.__TAURI_INTERNALS__;
  }
}

afterEach(() => {
  setTauriInternals(false);
  invokeMock.mockReset();
  listenMock.mockReset();
  vi.resetModules();
});

describe("bridge (modo web/mock)", () => {
  it("detecta ambiente fora do Tauri e preserva estado mutável entre chamadas", async () => {
    const bridge = await import("./bridge");

    expect(bridge.isTauriRuntime()).toBe(false);

    const initial = await bridge.getDockState();
    expect(initial).toEqual({
      edge: "right",
      expanded: false,
      alwaysOnTop: true,
      visible: true,
      shortcuts: { toggle: "Alt+Space", newNote: "Ctrl+Shift+N" },
    });

    const expanded = await bridge.setDockExpanded(true);
    expect(expanded.expanded).toBe(true);
    expect(expanded.edge).toBe("right");

    const movedLeft = await bridge.setDockEdge("left");
    expect(movedLeft.edge).toBe("left");
    expect(movedLeft.expanded).toBe(true);

    const unpinned = await bridge.setAlwaysOnTop(false);
    expect(unpinned.alwaysOnTop).toBe(false);
    expect(unpinned.edge).toBe("left");
    expect(unpinned.expanded).toBe(true);

    const collapsed = await bridge.toggleDockExpanded();
    expect(collapsed.expanded).toBe(false);
    expect(collapsed.visible).toBe(true);

    await bridge.hideDock();
    const afterHide = await bridge.getDockState();
    expect(afterHide.visible).toBe(false);

    const reopened = await bridge.setDockExpanded(true);
    expect(reopened.visible).toBe(true);
    expect(reopened.expanded).toBe(true);

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("reabre expandido em toggleDockExpanded quando oculto mesmo se já estava expandido", async () => {
    const bridge = await import("./bridge");

    await bridge.setDockExpanded(true);
    await bridge.hideDock();

    const toggled = await bridge.toggleDockExpanded();
    expect(toggled.visible).toBe(true);
    expect(toggled.expanded).toBe(true);
  });

  it("retorna funções unlisten no-op para listeners fora do Tauri", async () => {
    const bridge = await import("./bridge");

    const unlistenNew = await bridge.onDockNewNote(() => {});
    const unlistenState = await bridge.onDockStateChanged(() => {});

    expect(typeof unlistenNew).toBe("function");
    expect(typeof unlistenState).toBe("function");
    expect(() => unlistenNew()).not.toThrow();
    expect(() => unlistenState()).not.toThrow();
    expect(listenMock).not.toHaveBeenCalled();
  });
});

describe("bridge (modo Tauri IPC)", () => {
  it("encaminha comandos IPC exatos e repassa payload do backend Rust", async () => {
    setTauriInternals(true);
    const bridge = await import("./bridge");
    expect(bridge.isTauriRuntime()).toBe(true);

    const rustState: DockState = {
      edge: "top",
      expanded: true,
      alwaysOnTop: false,
      visible: true,
      shortcuts: { toggle: "Alt+Space", newNote: "Ctrl+Shift+N" },
    };

    invokeMock.mockResolvedValue(rustState);

    await expect(bridge.getDockState()).resolves.toEqual(rustState);
    expect(invokeMock).toHaveBeenLastCalledWith("get_dock_state");

    await expect(bridge.setDockEdge("top")).resolves.toEqual(rustState);
    expect(invokeMock).toHaveBeenLastCalledWith("set_dock_edge", { edge: "top" });

    await expect(bridge.setDockExpanded(true)).resolves.toEqual(rustState);
    expect(invokeMock).toHaveBeenLastCalledWith("set_dock_expanded", { expanded: true });

    await expect(bridge.toggleDockExpanded()).resolves.toEqual(rustState);
    expect(invokeMock).toHaveBeenLastCalledWith("toggle_dock_expanded");

    await expect(bridge.setAlwaysOnTop(false)).resolves.toEqual(rustState);
    expect(invokeMock).toHaveBeenLastCalledWith("set_always_on_top", { enabled: false });

    invokeMock.mockResolvedValueOnce(undefined);
    await bridge.hideDock();
    expect(invokeMock).toHaveBeenLastCalledWith("hide_dock");
  });

  it("propaga rejeição do backend Rust quando invoke falha", async () => {
    setTauriInternals(true);
    const bridge = await import("./bridge");

    invokeMock.mockRejectedValueOnce(new Error("Janela principal não encontrada"));

    await expect(bridge.setDockEdge("left")).rejects.toThrow("Janela principal não encontrada");
  });

  it("registra listeners de eventos dock:// e propaga payload ao callback", async () => {
    setTauriInternals(true);
    const bridge = await import("./bridge");

    const handlers = new Map<string, (event: { payload: unknown }) => void>();
    const unlistenFns = new Map<string, ReturnType<typeof vi.fn>>();

    listenMock.mockImplementation(
      async (eventName: string, cb: (event: { payload: unknown }) => void) => {
        handlers.set(eventName, cb);
        const unlisten = vi.fn();
        unlistenFns.set(eventName, unlisten);
        return unlisten;
      }
    );

    const onNew = vi.fn();
    const onState = vi.fn();

    const unlistenNew = await bridge.onDockNewNote(onNew);
    const unlistenState = await bridge.onDockStateChanged(onState);

    expect(listenMock).toHaveBeenCalledWith("dock://new-note", expect.any(Function));
    expect(listenMock).toHaveBeenCalledWith("dock://state-changed", expect.any(Function));

    handlers.get("dock://new-note")?.({ payload: undefined });
    expect(onNew).toHaveBeenCalledTimes(1);

    const pushedState: DockState = {
      edge: "left",
      expanded: true,
      alwaysOnTop: true,
      visible: true,
      shortcuts: { toggle: "Alt+Space", newNote: "Ctrl+Shift+N" },
    };
    handlers.get("dock://state-changed")?.({ payload: pushedState });
    expect(onState).toHaveBeenCalledWith(pushedState);

    unlistenNew();
    unlistenState();
    expect(unlistenFns.get("dock://new-note")).toHaveBeenCalledTimes(1);
    expect(unlistenFns.get("dock://state-changed")).toHaveBeenCalledTimes(1);
  });
});