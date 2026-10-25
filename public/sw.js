// 아쿠아잡 서비스 워커 — 웹 푸시 받기 · 알림 누르면 앱 안 화면 열기 (워너다이브 public/sw.js 참고)
// 캐시·오프라인 처리는 하지 않는다(fetch 이벤트 없음).
// 푸시 내용 = { title, body, link } (발송 API /api/push/flush가 그 셋만 싣는다).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 같은 출처의 앱 안 주소만 연다(다른 사이트 주소·'//'·'/\'면 홈으로)
function safeTarget(link) {
  try {
    if (typeof link !== "string" || link[0] !== "/" || link[1] === "/" || link[1] === "\\") {
      return new URL("/", self.location.origin);
    }
    const url = new URL(link, self.location.origin);
    return url.origin === self.location.origin ? url : new URL("/", self.location.origin);
  } catch {
    return new URL("/", self.location.origin);
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "알림"; // 발송 API가 항상 제목을 싣는다(없으면 브랜드 이름)
  const target = safeTarget(data.link);
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icon-192.png",
    data: { link: target.pathname + target.search },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 앱 창과 주고받는 메시지 이름 — lib/notifications/sw-message.ts와 같은 값(테스트가 확인)
const OPEN_LINK = "aqua:open-link";
const ACK = "aqua:ack";
// 앱이 답하길 기다리는 시간. 답이 없으면(앱이 아직 안 떴거나 예전 화면) 예전처럼 창 주소를 바꾼다
const ACK_WAIT_MS = 1500;

// 앱 화면(로그인한 역할 화면)이 떠 있는 경로 — 여기서만 메시지로 앱 안에서 이동한다
function isAppPath(pathname) {
  return pathname === "/" || pathname === "/admin";
}

// 열린 앱 창에 링크를 보내고 답(ACK)을 기다린다. 답이 오면 true
function postOpenLink(client, link) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    try {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => finish(!!(e.data && e.data.type === ACK));
      client.postMessage({ type: OPEN_LINK, link }, [ch.port2]);
      setTimeout(() => finish(false), ACK_WAIT_MS);
    } catch {
      finish(false);
    }
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeTarget(event.notification.data && event.notification.data.link);
  const href = target.href;
  const link = target.pathname + target.search; // 같은 출처 앱 안 주소만(safeTarget)
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          try {
            await client.focus();
          } catch {
            // 포커스가 막혀도 이동은 시도
          }
          // 앱이 떠 있으면 새로 고침 없이 앱 안에서 이동(작성 중이면 앱이 먼저 묻는다)
          if (isAppPath(url.pathname) && (await postOpenLink(client, link))) return;
          try {
            if ("navigate" in client) {
              await client.navigate(href);
              return;
            }
          } catch {
            // 서비스 워커가 관리하지 않는 창이면 navigate가 실패 → 새 창으로
          }
          break;
        }
      }
      await self.clients.openWindow(href);
    })()
  );
});
