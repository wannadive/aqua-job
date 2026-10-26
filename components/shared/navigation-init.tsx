"use client";

// 화면 이동·뒤로가기 장치(lib/navigation)를 앱이 처음 뜰 때 바로 준비한다 —
// popstate를 Next.js·화면 훅보다 먼저 받아야 작성 중 보호(되돌리고 묻기)가 동작한다.
import "@/lib/navigation/use-navigable";

export function NavigationInit() {
  return null;
}
