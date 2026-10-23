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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = safeTarget(event.notification.data && event.notification.data.link).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          try {
            await client.focus();
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
