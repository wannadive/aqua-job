import type { Metadata } from "next";
import { Fill, LegalPage, Section } from "@/components/legal/legal-page";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `이용약관 · ${BRAND.appName}` };

export default function TermsPage() {
  return (
    <LegalPage title="이용약관">
      <Section title="1. 목적">
        <p>
          이 약관은 {BRAND.name}({BRAND.nameEn}) 서비스를 이용하는 데 필요한 운영자와 회원 사이의 기본 규칙을 정해요.
        </p>
      </Section>

      <Section title={`2. ${BRAND.name}의 역할`}>
        <ul>
          <li>{BRAND.name}은 프리다이빙 강사와 센터가 서로 찾고 연락할 수 있게 연결만 해요.</li>
          <li>회원, 공고, 이력서의 내용을 보증하지 않아요. 회원을 평가하거나 추천하거나 순위를 매기지 않아요.</li>
          <li>
            서류 확인은 제출된 서류가 진짜인지, 이름이 맞는지, 유효기간이 언제까지인지 사실만 확인하는 거예요. 그 사람의 실력이나
            안전을 보증하는 뜻이 아니에요.
          </li>
          <li>
            수업·소속·투어의 조건(보수, 일정 등)과 계약, 그 이행은 강사와 센터 당사자끼리 정하고 책임져요. {BRAND.name}은 단가를
            조정하거나 분쟁을 중재하지 않아요.
          </li>
        </ul>
      </Section>

      <Section title="3. 계정">
        <ul>
          <li>본인의 실제 정보로 가입해요. 계정 하나는 강사 또는 센터 중 한 가지 유형만 가질 수 있어요.</li>
          <li>비밀번호는 본인이 관리해요. 계정을 남에게 넘기거나 빌려주면 안 돼요.</li>
          <li>언제든 탈퇴할 수 있어요. 탈퇴하면 개인정보처리방침에 따라 정보를 삭제해요.</li>
        </ul>
      </Section>

      <Section title="4. 서류 제출">
        <ul>
          <li>본인의 실제 서류만 올려요. 신분증은 주민등록번호 뒷자리를 가리고 찍어 주세요.</li>
          <li>운영자는 서류를 확인하거나, 사유를 적어 반려해요. 반려되면 다시 올릴 수 있어요.</li>
          <li>일부 기능(예: 센터의 공고 등록·제안)은 정해진 서류가 확인돼야 쓸 수 있어요.</li>
        </ul>
      </Section>

      <Section title="5. 하면 안 되는 일">
        <ul>
          <li>가짜이거나 고친 서류를 올리는 것, 남의 서류를 자기 것처럼 올리는 것</li>
          <li>실제로 없는 수업·조건을 올리는 등 허위 공고</li>
          <li>연결이 아닌 연락처 수집을 목적으로 공고·제안을 이용하는 것, 받은 연락처를 연결 목적 밖으로 쓰거나 남에게 넘기는 것</li>
          <li>다른 사람이나 다른 센터인 척하는 것</li>
          <li>법을 어기는 행위, 서비스 운영을 방해하는 행위</li>
        </ul>
      </Section>

      <Section title="6. 위반했을 때의 조치">
        <ul>
          <li>조치는 위 규칙을 어긴 경우에만 해요. 좋고 나쁨을 평가해서 하는 조치는 없어요.</li>
          <li>조치는 위반 정도에 따라 공고 숨김, 계정 정지, 퇴출(영구 이용 정지) 중에서 해요.</li>
          <li>조치 사유는 정해진 위반 항목 중에서 고르고 기록을 남기며, 당사자에게 알려요.</li>
          <li>퇴출된 계정은 로그인할 수 없고, 그 계정의 공고는 숨겨져요. 이미 상대방에게 공개된 연락처는 상대방 기록에 남을 수 있어요.</li>
          <li>조치에 이의가 있으면 아래 연락처로 알려 주세요.</li>
        </ul>
      </Section>

      <Section title="7. 책임의 범위">
        <p>
          {BRAND.name}은 회원끼리 맺은 약속·계약·거래와 그 과정에서 생긴 분쟁의 당사자가 아니에요. 다만 운영자의 고의나 중대한
          과실로 생긴 손해는 법령에 따라 책임져요.
        </p>
      </Section>

      <Section title="8. 약관 변경">
        <p>약관을 바꿀 때는 시행 7일 전부터 앱에서 알려요. 회원에게 불리한 변경은 30일 전부터 알려요.</p>
      </Section>

      <Section title="9. 운영자 정보">
        <ul>
          <li>
            상호: <Fill>[운영자 상호]</Fill>
          </li>
          <li>
            대표자: <Fill>[대표자]</Fill>
          </li>
          <li>
            연락처: <Fill>[연락처]</Fill>
          </li>
          <li>
            시행일: <Fill>[시행일]</Fill>
          </li>
        </ul>
      </Section>
    </LegalPage>
  );
}
