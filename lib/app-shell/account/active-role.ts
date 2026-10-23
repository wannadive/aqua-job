// 여러 역할 계정이 마지막으로 고른 역할(상단 탭). 기기에만 남는 편의 값이라
// 읽기·쓰기가 막힌 환경(사생활 보호 모드 등)에서는 조용히 넘어간다. 값 검증은 resolveActiveRole이 한다.

const ACTIVE_ROLE_KEY = "aqua.activeRole";

export function readActiveRole(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ROLE_KEY);
  } catch {
    return null;
  }
}

export function writeActiveRole(role: string) {
  try {
    localStorage.setItem(ACTIVE_ROLE_KEY, role);
  } catch {
    // 이번 접속에서만 유효
  }
}
