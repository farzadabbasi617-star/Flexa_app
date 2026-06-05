import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
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
  login: (emailOrUsername: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, username: string, password: string, displayName: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);

  // Use React Query for session management
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
    staleTime: 1000 * 60 * 5, // Session data is considered fresh for 5 mins
  });

  // Sync React Query state with local state if needed, 
  // though we can mostly rely on sessionData
  const currentUser = sessionData || user;

  const refreshUser = useCallback(async () => {
    await refetchSession();
  }, [refetchSession]);

  async function login(emailOrUsername: string, password: string) {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emailOrUsername, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error };
      }

      // Invalidate and refetch session
      queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      setUser(data.user);
      return { success: true };
    } catch {
      return { success: false, error: "Login failed" };
    }
  }

  async function register(email: string, username: string, password: string, displayName: string) {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, username, password, displayName }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error };
      }

      queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      setUser(data.user);
      return { success: true };
    } catch {
      return { success: false, error: "Registration failed" };
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    setUser(null);
    queryClient.setQueryData(["auth-session"], null);
  }

  return (
    <AuthContext.Provider value={{ 
      user: currentUser, 
      loading: isSessionLoading, 
      login, 
      register, 
      logout, 
      refreshUser 
    }}>
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
