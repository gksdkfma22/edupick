/* 에듀픽 Service Worker v1.0 */
const CACHE_NAME = 'edupick-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.png',
];

const EXTERNAL_CACHE = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://dapi.kakao.com',
];

/* 설치 - 핵심 파일 캐시 */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 캐시 설치 중...');
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    }).catch(err => console.log('[SW] 캐시 설치 오류:', err))
  );
  self.skipWaiting();
});

/* 활성화 - 구버전 캐시 삭제 */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* 요청 처리 - 캐시 우선 전략 */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  /* Supabase API - 항상 네트워크 우선 */
  if(url.hostname.includes('supabase.co')){
    e.respondWith(
      fetch(e.request).catch(() => new Response('{"error":"offline"}', {
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  /* 카카오맵 - 네트워크 우선, 실패 시 캐시 */
  if(url.hostname.includes('kakao')){
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  /* 구글폰트 - 캐시 우선 */
  if(url.hostname.includes('fonts')){
    e.respondWith(
      caches.match(e.request).then(cached => {
        if(cached) return cached;
        return fetch(e.request).then(res => {
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  /* 정적 자산 - 캐시 우선, 없으면 네트워크 */
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(res => {
        if(res && res.status === 200 && e.request.method === 'GET'){
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        /* 오프라인 fallback */
        if(e.request.destination === 'document'){
          return caches.match('/index.html');
        }
      });
    })
  );
});

/* 백그라운드 동기화 (예약/문의) */
self.addEventListener('sync', (e) => {
  if(e.tag === 'sync-reviews'){
    console.log('[SW] 리뷰 동기화 중...');
  }
});

/* 푸시 알림 */
self.addEventListener('push', (e) => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || '에듀픽', {
      body:  data.body  || '새 알림이 있어요',
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
      data:  data.url ? { url: data.url } : {},
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.openWindow(url));
});
