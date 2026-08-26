// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(LoginForm)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function passwordInput(): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>("#password");
    if (input === null) throw new Error("Password input was not rendered.");
    return input;
  }

  function visibilityButton(): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(".password-visibility-button");
    if (button === null) throw new Error("Password visibility button was not rendered.");
    return button;
  }

  it("hides the password by default", () => {
    expect(passwordInput().type).toBe("password");
    expect(visibilityButton()).toMatchObject({
      type: "button",
      textContent: "Show",
    });
    expect(visibilityButton().getAttribute("aria-label")).toBe("Show password");
    expect(visibilityButton().getAttribute("aria-pressed")).toBe("false");
  });

  it("reveals the currently typed password", async () => {
    passwordInput().value = "local-only-password";

    await act(async () => visibilityButton().click());

    expect(passwordInput()).toMatchObject({
      type: "text",
      value: "local-only-password",
    });
    expect(visibilityButton().getAttribute("aria-label")).toBe("Hide password");
    expect(visibilityButton().getAttribute("aria-pressed")).toBe("true");
  });

  it("masks the password again without clearing it", async () => {
    passwordInput().value = "local-only-password";

    await act(async () => visibilityButton().click());
    await act(async () => visibilityButton().click());

    expect(passwordInput()).toMatchObject({
      type: "password",
      value: "local-only-password",
    });
    expect(visibilityButton().textContent).toBe("Show");
  });

  it("does not submit the login form when visibility is toggled", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await act(async () => visibilityButton().click());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the existing login request and navigation behavior", async () => {
    const email = container.querySelector<HTMLInputElement>("#email");
    const form = container.querySelector<HTMLFormElement>("form");
    if (email === null || form === null) throw new Error("Login form was not rendered.");
    email.value = "admin@example.com";
    passwordInput().value = "submitted-password";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "submitted-password",
      }),
    });
    expect(navigation.replace).toHaveBeenCalledWith("/workspaces");
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });
});
