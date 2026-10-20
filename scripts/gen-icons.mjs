// PWA 아이콘 PNG 만들기: public/icon.svg(물결 표시)를 192·512, 애플 홈 화면용 180으로 그린다.
// sharp는 next가 이미 가져온 것을 빌려 쓴다(새 의존성 없음). 실행: node scripts/gen-icons.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(createRequire(import.meta.url).resolve("next/package.json"));
const sharp = require("sharp");

const svg = readFileSync("public/icon.svg");
// 애플 아이콘은 iOS가 모서리를 직접 둥글게 깎으므로 둥근 모서리 없이 꽉 채운다.
const squareSvg = Buffer.from(svg.toString().replace(/ rx="\d+"/, ""));

const jobs = [
  { file: "public/icon-192.png", size: 192, src: svg },
  { file: "public/icon-512.png", size: 512, src: svg },
  { file: "public/apple-touch-icon.png", size: 180, src: squareSvg },
];
for (const j of jobs) {
  await sharp(j.src, { density: 300 }).resize(j.size, j.size).png().toFile(j.file);
  console.log("wrote", j.file);
}
