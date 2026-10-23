import { PublicShell } from "@/components/app-shell/public/public-pages";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
