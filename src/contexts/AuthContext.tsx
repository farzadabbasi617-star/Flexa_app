"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface User {
  id: string;
  email: string | null;
  phoneNumber: string;
  phoneVerifiedAt: string | null;
  username: string;
  displayName: string;
  flexaId: string;
  role: string;
  avatarUrl: string | null;
  isVerified: boolean;
  level: number;
  rankPoints: number;
  clashRoyaleId: string | null;
  clashRoyaleUsername: string | null;
  codMobileId: string | null;
  codMobileUsername: string | null;
  fortniteId: string | null;
  fortniteUsername: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    phoneNumber: string,
    email: string,
    username: string,
    password: string,
    displayName: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const csrfHeaders = {
  "X-Requested-With": "XMLHttpRequest",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);

  const { data: sessionData, isLoading: isSessionLoading, refetch: refetchSession } = useQuery({
    queryKey: ["auth-session"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("No active session");
      const data = await res.json();
      return data.user as User | null;
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const currentUser = sessionData || user;

  const refreshUser = useCallback(async () => {
    const result = await refetchSession();
    setUser(result.data ?? null);
  }, [refetchSession]);

  async function login(identifier: string, password: string) {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        credentials: "include",
        body: JSON.stringify({ emailOrUsername: identifier, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || "ورود ناموفق بود" };
      }

      setUser(data.user);
      queryClient.setQueryData(["auth-session"], data.user);
      return { success: true };
    } catch {
      return { success: false, error: "Login failed" };
    }
  }

  async function register(
    phoneNumber: string,
    email: string,
    username: string,
    password: string,
    displayName: string
  ) {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        credentials: "include",
        body: JSON.stringify({ phoneNumber, email: email || undefined, username, password, displayName }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || "ثبت‌نام با خطا مواجه شد" };
      }

      setUser(data.user);
      queryClient.setQueryData(["auth-session"], data.user);
      return { success: true };
    } catch {
      return { success: false, error: "خطای ارتباط با سرور. اتصال اینترنت را بررسی کنید." };
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: csrfHeaders,
        credentials: "include",
      });
    } catch {
      // ignore
    }
    setUser(null);
    queryClient.setQueryData(["auth-session"], null);
  }

  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        loading: isSessionLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
