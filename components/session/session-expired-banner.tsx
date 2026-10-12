"use client";

import { ExternalLinkIcon } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { useSession } from "./session-provider";

// Shown on every page while the login session is expired. The queue is paused, nothing is
// marked as failed, and it resumes on its own once the user has logged in again.
export function SessionExpiredBanner() {
  const { authExpired } = useSession();
  if (!authExpired) return null;

  return (
    <Notice
      tone="error"
      action={
        <Button
          variant="outline"
          size="sm"
          // A new tab, so this one (and its results) stays as it is.
          onClick={() => window.open("/login?next=%2Freauth", "_blank", "noopener")}
        >
          <ExternalLinkIcon /> Đăng nhập lại
        </Button>
      }
    >
      Phiên đăng nhập hết hạn — đăng nhập lại để tiếp tục. Kết quả trong tab này vẫn được giữ.
    </Notice>
  );
}
