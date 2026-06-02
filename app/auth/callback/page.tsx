"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * OAuth callback page.
 * The API redirects back here with query params after Google sign-in.
 * We parse them and redirect to the main page which handles the rest.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // The main page (/) checks for auth params on mount.
    // We just redirect there, preserving query params.
    router.replace("/");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  );
}
