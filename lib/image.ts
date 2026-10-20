// 공용 이미지 처리 (브라우저 전용) — 업로드 전 리사이즈·압축.

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽을 수 없어요")); };
    img.src = url;
  });
}

/** 긴 변 최대 maxEdge px, JPEG(0.8)로 다시 인코딩한 File을 돌려준다. */
export async function compressImage(file: File, maxEdge = 1600): Promise<File> {
  const img = await loadImage(file);
  const r = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * r));
  const h = Math.max(1, Math.round(img.naturalHeight * r));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff"; // 투명 PNG → 흰 배경 (JPEG는 투명이 검게 나옴)
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.8));
  if (!blob) throw new Error("이미지를 압축할 수 없어요");
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
