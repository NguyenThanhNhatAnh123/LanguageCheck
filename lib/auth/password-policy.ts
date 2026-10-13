// Shared-account password rules, used by `npm run hash-password`. One password for the whole
// team, reachable from the internet: it should be long and random (README "Bảo mật").

/** Below this the password is refused. */
export const MIN_PASSWORD_LENGTH = 8;
/** Below this the script warns: the shared password should be at least 16 random characters. */
export const RECOMMENDED_PASSWORD_LENGTH = 16;
/** bcrypt ignores everything after 72 bytes. */
export const BCRYPT_MAX_BYTES = 72;

export interface PasswordCheck {
  /** Set when the password cannot be used. */
  error: string | null;
  /** Set when it can be used but is weaker than recommended. */
  warning: string | null;
}

export function checkPassword(password: string): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`, warning: null };
  }
  if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES) {
    return { error: `Mật khẩu dài tối đa ${BCRYPT_MAX_BYTES} byte (giới hạn của bcrypt).`, warning: null };
  }
  if (password.length < RECOMMENDED_PASSWORD_LENGTH) {
    return {
      error: null,
      warning: `CẢNH BÁO: mật khẩu chỉ có ${password.length} ký tự. Tài khoản chung nên dùng mật khẩu ngẫu nhiên từ ${RECOMMENDED_PASSWORD_LENGTH} ký tự trở lên.`,
    };
  }
  return { error: null, warning: null };
}
