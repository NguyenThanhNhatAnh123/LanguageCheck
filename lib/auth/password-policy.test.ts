import { describe, expect, it } from "vitest";
import { checkPassword } from "./password-policy";

describe("checkPassword", () => {
  it("refuses fewer than 8 characters", () => {
    expect(checkPassword("short").error).toMatch(/ít nhất 8/);
  });

  it("warns below 16 characters but accepts the password", () => {
    const result = checkPassword("abcdefgh1234");
    expect(result.error).toBeNull();
    expect(result.warning).toMatch(/12 ký tự.*16/);
  });

  it("accepts 16+ characters without a warning", () => {
    expect(checkPassword("k7Qp2vX9mZr4Tb8w")).toEqual({ error: null, warning: null });
  });

  it("refuses more than 72 bytes (bcrypt limit)", () => {
    expect(checkPassword("ü".repeat(40)).error).toMatch(/72 byte/);
  });
});
