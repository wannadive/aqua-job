# 아쿠아잡 결제 전 수정 A (사용 편의) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 사장님이 정한 "결제 전 수정 목록" A 묶음(A1~A6)을 끝낸다 — 폰 뒤로가기, 작성 중 보호, 종 고정, 자격 등급 선택형, 내 공고 지원 버튼 숨김, 문구 정확도.

**Architecture:** v0.3.0(main 935bb7d+) 위에서 화면 코드만 고친다. DB(SQL) 변경 없음 — 서버가 최종 관문인 구조는 그대로. 새 공용 장치(뒤로가기·작성 중 보호)는 도메인 모듈이 app-shell을 import하지 않는 경계 규칙을 지킨다(공용은 `hooks/` 또는 `lib/navigation/`, `lib/boundaries.test.ts` 갱신).

**Branch:** `prepay-a` (main에서). 배포는 사장님 확인 후 main 병합.

**사장님 방향 (binding):** 기능은 최대한 디테일하게, 보안 빈틈 없이. UI는 기존 화면과 일관된 기능 위주(디자인 다듬기는 B 묶음에서 사장님과 같이). 한국어·중립 문구(검증/보증/추천/인증됨 금지).

---

### Task 1: 화면 이동 — A1 폰 뒤로가기 · A2 작성 중 보호 · A3 종 고정

- **A1 폰 뒤로가기:** 워너다이브 `C:\Users\USER\dev\wanna-dive\hooks\use-navigable.ts`(useNavigable/useNavigableView/useNavigableValue/closeNavigable/goBackInApp)와 `components/ui`의 `useBackToClose`(Dialog·AlertDialog·Sheet 자동 방문 기록 한 칸) 방식을 아쿠아잡에 이식한다. 워너다이브 CLAUDE.md "화면 이동·뒤로가기" 규칙과 같은 동작:
  - 덮는 화면(공고 상세, 이력서 보기, 제안 쓰기, 지원서, 알림 목록, 관리자 상세·대화창, 공고 작성·수정, 센터 공개 프로필 등)은 방문 기록에 올라가 폰 뒤로가기(왼쪽 밀기)가 그 화면만 닫는다. 화면 안 [뒤로]/닫기 버튼도 같은 길(closeNavigable)로.
  - 팝업(Dialog·AlertDialog·Sheet)은 자동으로 기록 한 칸 — 폰 뒤로가기 = 팝업만 닫힘. 팝업 위에서 화면을 닫으면 팝업 칸까지 같이 넘김, 팝업에서 다른 화면으로 가면 팝업 칸을 바꿔 씀.
  - 아이폰 사파리·크롬(WebKit) 기준으로 동작해야 한다(워너다이브에서 검증된 타이밍 처리를 그대로).
  - 알림 링크(`/?tab=…`) 처리·`replaceState` 정리와 충돌하지 않게.
- **A2 작성 중 보호:** 쓰던 내용이 있는(dirty) 입력 화면 — 공고 작성·수정(JobForm), 이력서 편집(ResumeEditor·첫 이력서 ResumeWizard), 센터 정보(CenterProfileForm), 지원서·제안 쓰기·신고·관리자 조치 대화창의 입력 — 에서 다음으로 나가려 하면 "작성 중인 내용이 사라져요. 나갈까요?" 확인:
  - 폰 뒤로가기, 화면 안 [뒤로]/닫기, 아래 탭 이동, 위 역할 탭([관리자][강사][센터]) 전환, 알림(종)으로 이동.
  - 앱을 켠 채 푸시를 누를 때: `public/sw.js`가 `client.navigate()`로 전체 새로고침하지 말고 열린 창에 `postMessage`로 링크를 보내 앱 안에서 이동(작성 중이면 위 확인을 거침). 창이 없으면 지금처럼 새 창 열기. 같은 출처 링크만(기존 safeTarget 유지).
  - 브라우저 새로고침·탭 닫기는 `beforeunload` 경고(dirty일 때만).
  - 종을 작성 화면에서 숨기던 임시 처리(Task 6)는 이 확인으로 대체해도 되고 유지해도 된다 — 일관되게.
- **A3 종 고정:** 위쪽 막대(역할 탭 + 종)가 스크롤해도 보이게(sticky, 안전 영역 safe-area 고려). 덮는 화면·팝업과 겹치지 않게.
- 테스트(node:test): 뒤로가기 기록 쌓기/닫기 순서 같은 순수 로직, dirty 판정, sw 메시지 링크 검사.
- 점검표(보고서): 화면별로 폰 뒤로가기 → 무엇이 닫히는지, 작성 중 나가기 경로별 확인 여부.

### Task 2: 입력·문구 — A4 자격 등급 선택형 · A5 내 공고 지원 숨김 · A6 문구

- **A4 자격 등급 선택형:** 이력서의 자격 단체·등급 입력을 목록에서 고르게(단체: AIDA · PADI · SSI · Molchanovs · CMAS · 기타 / 단체별 등급 목록 + "기타(직접 입력)"). 목록 값은 `lib/talent-profile`에 한 곳에서 정의. 강사 찾기 필터의 등급도 같은 목록에서 고르게 — 서버 필터(`browse_instructors`의 `level` = `lower(btrim())` 일치)와 그대로 맞물린다. 기존에 직접 입력된 값은 그대로 보이고, 편집하면 목록에서 고르도록(목록에 없는 기존 값은 "기타"로 유지). 필터 화면의 "글자가 같아야 찾아져요" 안내는 목록 선택이면 지운다.
- **A5 내 공고에는 [지원하기] 숨김:** 겸용 계정(센터+강사)이 공고 목록·상세에서 자기 공고를 보면 [지원하기] 대신 "내 공고" 표시. 서버는 이미 막음(그대로).
- **A6 문구 정확도:**
  - 공고 마감 안내를 실제 마감 이유(`closed_reason`: 인원 참·기간 지남·직접 마감)대로. "인원이 다 차서"는 인원이 찼을 때만.
  - 제안 쓰기 안내: 불러오는 중이면 "불러오는 중", 실패했을 때만 "불러오지 못했어요"(지금은 불러오는 중에도 실패 문구).
  - 알림 열림 처리 `launchLink`를 `{userId, link}`로 저장해 다른 계정으로 바뀐 직후 잘못 읽음 처리되지 않게(Task 6 minor).
  - 로그인 화면 `?auth` 쿼리가 주소창에 남는 것 정리(2단계 minor).
- 테스트(node:test): 등급 목록·필터 값 일치, 마감 이유 → 문구, 내 공고 판정.
- 문서: 스펙 §9·RELEASE_NOTES(다음 버전 항목은 배포 때), `docs/FINFRIENDS_INTEGRATION.md` 모듈 목록(새 공용 장치).
