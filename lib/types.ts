export type User = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AuthResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
};

export type StoredSession = {
  mode: "api" | "demo";
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
};

export type CommitmentStatus = "pending" | "completed" | "cancelled" | "overdue";

export type Commitment = {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: CommitmentStatus;
  category: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateCommitmentForm = {
  title: string;
  amount: string;
  category: string;
};
