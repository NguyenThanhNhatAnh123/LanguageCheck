// Landing page for the "Đăng nhập lại" tab opened when the session expired mid-batch.
export default function ReauthPage() {
  return (
    <div className="mx-auto max-w-md space-y-2 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Đã đăng nhập lại</h1>
      <p className="text-muted-foreground">
        Quay lại tab đang kiểm tra: việc kiểm tra sẽ tự chạy tiếp trong vài giây. Bạn có thể đóng tab này.
      </p>
    </div>
  );
}
