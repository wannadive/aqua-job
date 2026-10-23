"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { compressImage } from "@/lib/image";
import { submitDocument } from "@/lib/verification/api";
import { DOC_TYPES } from "@/lib/verification/config";
import type { DocType } from "@/lib/verification/types";

const CERT_TYPES: DocType[] = ["instructor_cert", "rep_instructor_cert"];

export function DocumentUploadSheet({
  docType,
  open,
  onOpenChange,
  onSubmitted,
}: {
  docType: DocType | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmitted: () => void;
}) {
  const cfg = docType ? DOC_TYPES[docType] : null;
  const isCert = docType ? CERT_TYPES.includes(docType) : false;
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [org, setOrg] = useState("");
  const [grade, setGrade] = useState("");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setOrg("");
      setGrade("");
      setNumber("");
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setFile(await compressImage(f, 2000));
    } catch {
      toast.error("사진을 읽지 못했어요. 다른 사진으로 시도해 주세요");
    }
  };

  const canSubmit = !!file && !busy && (!isCert || (org.trim() !== "" && grade.trim() !== ""));

  const submit = async () => {
    if (!docType || !file || busy) return;
    setBusy(true);
    try {
      const res = await submitDocument({
        docType,
        file,
        meta: isCert ? { org: org.trim(), grade: grade.trim(), number: number.trim() } : undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("서류를 제출했어요. 확인이 끝나면 여기에 표시돼요");
      onOpenChange(false);
      onSubmitted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-md overflow-y-auto">
        <SheetTitle className="text-xl font-bold text-ink">{cfg?.label} 제출</SheetTitle>
        <SheetDescription className="sr-only">서류 사진을 올려 제출해요</SheetDescription>

        {cfg?.hint && <p className="mt-4 rounded-xl bg-warn-bg p-4 text-base font-semibold leading-relaxed text-warn">{cfg.hint}</p>}

        <div className="mt-4">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="제출할 서류 미리보기" className="max-h-72 w-full rounded-xl bg-surface object-contain" />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-line bg-surface text-sm text-muted">
              사진을 선택해 주세요
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-12" onClick={() => camRef.current?.click()} disabled={busy}>
              <Camera className="size-4" /> 카메라로 찍기
            </Button>
            <Button type="button" variant="outline" className="h-12" onClick={() => galRef.current?.click()} disabled={busy}>
              사진 선택
            </Button>
          </div>
          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={galRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        {isCert && (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm font-semibold text-ink">
                단체 <span className="font-normal text-muted">(본인 입력)</span>
              </span>
              <Input value={org} maxLength={30} placeholder="예: AIDA" onChange={(e) => setOrg(e.target.value)} className="mt-1 h-12" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink">
                등급 <span className="font-normal text-muted">(본인 입력)</span>
              </span>
              <Input value={grade} maxLength={30} placeholder="예: 강사" onChange={(e) => setGrade(e.target.value)} className="mt-1 h-12" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink">
                자격 번호 <span className="font-normal text-muted">(선택)</span>
              </span>
              <Input value={number} maxLength={40} onChange={(e) => setNumber(e.target.value)} className="mt-1 h-12" />
            </label>
          </div>
        )}

        <p className="mt-4 text-sm text-muted">제출한 서류 사진은 본인과 관리자만 볼 수 있어요.</p>

        <Button className="mt-4 h-[52px] w-full bg-ink text-base text-white" onClick={() => void submit()} disabled={!canSubmit}>
          {busy ? "제출 중…" : "제출하기"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
