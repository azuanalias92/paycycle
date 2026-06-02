const API_BASE_URL = "https://paycycle-api.traone.workers.dev";

/**
 * Build the Google OAuth URL that redirects back to this web app.
 */
export function buildGoogleAuthUrl() {
  const url = new URL("/auth/google", API_BASE_URL);
  url.searchParams.set("redirect_to", `${window.location.origin}/auth/callback`);
  return url.toString();
}

/**
 * Parse the OAuth callback URL hash/query params into a session.
 * The API can pass tokens via query params (redirect-based auth).
 */
export function parseCallbackUrl(url: string): {
  type: "success" | "error";
  payload?: any;
  message?: string;
} {
  const parsedUrl = new URL(url);
  const errorMessage = parsedUrl.searchParams.get("error_description");
  if (errorMessage) {
    return { type: "error", message: errorMessage };
  }

  const accessToken = parsedUrl.searchParams.get("access_token");
  const refreshToken = parsedUrl.searchParams.get("refresh_token");
  const tokenType = parsedUrl.searchParams.get("token_type");
  const expiresIn = Number(parsedUrl.searchParams.get("expires_in"));
  const userId = parsedUrl.searchParams.get("user_id");
  const userEmail = parsedUrl.searchParams.get("user_email");
  const userName = parsedUrl.searchParams.get("user_name");

  if (
    !accessToken ||
    !refreshToken ||
    !tokenType ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0 ||
    !userId ||
    !userEmail ||
    !userName
  ) {
    return {
      type: "error",
      message: "PayCycle did not receive a complete sign-in response.",
    };
  }

  return {
    type: "success",
    payload: {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: tokenType,
      expires_in: expiresIn,
      user: {
        id: userId,
        email: userEmail,
        name: userName,
        avatar_url: parsedUrl.searchParams.get("user_avatar_url"),
        created_at: parsedUrl.searchParams.get("user_created_at") ?? undefined,
        updated_at: parsedUrl.searchParams.get("user_updated_at") ?? undefined,
      },
    },
  };
}
