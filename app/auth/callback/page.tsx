"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import type { StoredSession } from "@/lib/types";
import { setSession } from "@/lib/api";
import { parseCallbackUrl } from "@/lib/auth";

/**
 * OAuth callback page.
 * The API redirects back here with query params after Google sign-in.
 * We process the tokens here and redirect to the main page.
 */
export default function AuthCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("access_token");

    if (accessToken) {
      const parsed = parseCallbackUrl(window.location.href);
      if (parsed.type === "success" && parsed.payload) {
        const session: StoredSession = {
          mode: "api",
          accessToken: parsed.payload.access_token,
          refreshToken: parsed.payload.refresh_token,
          tokenType: parsed.payload.token_type,
          expiresIn: parsed.payload.expires_in,
          user: parsed.payload.user,
        };
        setSession(session);
      }
    }

    // Redirect to main page — session is already in localStorage
    window.location.replace("/");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  );
}
