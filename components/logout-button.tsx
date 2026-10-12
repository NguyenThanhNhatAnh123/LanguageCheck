"use client";

import { LogOutIcon } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session/session-provider";

export function LogoutButton() {
  const session = useSession();
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function logout() {
    setPending(true);
    // The shared account must not leave results behind for the next person.
    session.endSession();
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Full navigation so no client state or prefetched pages from the old session survive.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => (session.items.length > 0 ? setConfirm(true) : void logout())}
      >
        <LogOutIcon /> <span className="hidden sm:inline">Đăng xuất</span>
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Đăng xuất?</AlertDialogTitle>
            <AlertDialogDescription>Đăng xuất sẽ kết thúc phiên kiểm tra và xóa toàn bộ kết quả trong tab này.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => void logout()}>
              Đăng xuất
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
