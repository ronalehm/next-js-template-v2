import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IdentityBadge } from "./IdentityBadge";
import type { IdentityState } from "../types/users.types";

afterEach(cleanup);

describe("IdentityBadge", () => {
  it("shows the text warning only for not_found in the table", () => {
    render(<IdentityBadge state="not_found" />);
    expect(screen.getByText("Identidad no encontrada")).toBeTruthy();
  });

  it.each<IdentityState>(["verified", "unverified", "unlinked"])("renders nothing for %s in the table", (state) => {
    const { container } = render(<IdentityBadge state={state} />);
    expect(container.childElementCount).toBe(0);
    expect(screen.queryByText("Identidad no encontrada")).toBeNull();
  });

  it.each<[IdentityState, string]>([
    ["verified", "Verificada"],
    ["not_found", "No encontrada"],
    ["unverified", "Sin verificar"],
    ["unlinked", "Sin vincular"],
  ])("shows the %s label in detail mode", (state, label) => {
    render(<IdentityBadge state={state} detail />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText("Identidad no encontrada")).toBeNull();
  });
});
