import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import type { AuthProfile, RestaurantInfo } from "../types";
import { applyThemeToDocument, DEFAULT_THEME, parseThemeConfig } from "../../settings/theme";

interface AuthContextValue {
  session: Session | null;
  profile: AuthProfile | null;
  restaurant: RestaurantInfo | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadProfileAndRestaurant(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const profileRes = await supabase
    .from("profiles")
    .select("id, role, name, email, active")
    .eq("id", user.id)
    .maybeSingle();

  const restaurantRes = await supabase
    .from("restaurants")
    .select(
      "id, name, ruc, address, phone, sri_environment, default_tip_percent, theme_config"
    )
    .limit(1)
    .maybeSingle();

  if (profileRes.error) throw profileRes.error;
  if (restaurantRes.error) throw restaurantRes.error;

  const fallbackName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : user.email?.split("@")[0] ?? "Usuario";

  const row = profileRes.data;

  return {
    profile: {
      id: user.id,
      role: (row?.role ?? "waiter") as AuthProfile["role"],
      name: row?.name ?? fallbackName,
      email: row?.email ?? user.email ?? "",
      active: row?.active ?? true,
    } satisfies AuthProfile,
    restaurant: restaurantRes.data as RestaurantInfo | null,
  };
}

function applyRestaurantTheme(restaurant: RestaurantInfo | null) {
  if (typeof document === "undefined") return;
  applyThemeToDocument(parseThemeConfig(restaurant?.theme_config));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const profileLoadIdRef = useRef(0);

  const loadProfileForSession = useCallback(async (nextSession: Session | null) => {
    const loadId = ++profileLoadIdRef.current;

    if (!nextSession?.user?.id) {
      setProfile(null);
      setRestaurant(null);
      return;
    }

    try {
      const loaded = await loadProfileAndRestaurant(nextSession.user);
      if (loadId !== profileLoadIdRef.current) return;
      setProfile(loaded.profile);
      setRestaurant(loaded.restaurant);
      applyRestaurantTheme(loaded.restaurant);
    } catch (err) {
      console.error("[auth] Error cargando perfil", err);
      if (loadId !== profileLoadIdRef.current) return;
      setProfile(null);
      setRestaurant(null);
    }
  }, []);

  const refreshState = useCallback(async () => {
    const {
      data: { session: currentSession },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.error("[auth] getSession", error);
      return;
    }

    setSession(currentSession);
    await loadProfileForSession(currentSession);
  }, [loadProfileForSession]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error("[auth] getSession inicial", error);
        } else {
          setSession(initialSession);
          await loadProfileForSession(initialSession);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "INITIAL_SESSION") {
        return;
      }

      setSession(nextSession);

      if (event === "SIGNED_OUT") {
        profileLoadIdRef.current += 1;
        setProfile(null);
        setRestaurant(null);
        applyThemeToDocument(DEFAULT_THEME);
        setLoading(false);
        return;
      }

      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        void loadProfileForSession(nextSession);
      }
    });

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.auth.getSession().then(({ data: { session: visibleSession } }) => {
        if (!mounted) return;
        setSession(visibleSession);
        if (visibleSession?.user?.id) {
          void loadProfileForSession(visibleSession);
        }
      });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadProfileForSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await refreshState();
    } finally {
      setLoading(false);
    }
  }, [refreshState]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, profile, restaurant, loading, signIn, signOut, reload }),
    [session, profile, restaurant, loading, signIn, signOut, reload]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return context;
}
