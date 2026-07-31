import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { ProtectedRoute } from "../modules/auth/components/ProtectedRoute";
import { useAuth } from "../modules/auth/context/AuthProvider";
import { LoginPage } from "../modules/auth/pages/LoginPage";
import { OnboardingPage } from "../modules/settings/pages/OnboardingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MenuPage } from "../modules/menu/pages/MenuPage";
import { TablesPage } from "../modules/tables/pages/TablesPage";
import { OrdersPage } from "../modules/orders/pages/OrdersPage";
import { KdsPage } from "../modules/kds/pages/KdsPage";
import { BillingPage } from "../modules/billing/pages/BillingPage";
import { InvoiceEmitPage } from "../modules/billing/pages/InvoiceEmitPage";
import { InvoiceHistoryPage } from "../modules/billing/pages/InvoiceHistoryPage";
import { UsersPage } from "../modules/settings/pages/UsersPage";
import { SettingsPage } from "../modules/settings/pages/SettingsPage";
import { ReportsPage } from "../modules/reports/pages/ReportsPage";

/** Redirige al home del rol: waiter → /orders, resto → /dashboard */
function RoleHome() {
  const { loading, profile } = useAuth();
  if (loading) return null;
  return <Navigate to={profile?.role === "waiter" ? "/orders" : "/dashboard"} replace />;
}

function RootGate() {
  const { loading, session, profile, restaurant } = useAuth();

  if (loading) return <p style={{ padding: 16 }}>Cargando...</p>;
  if (!session) return <Navigate to="/login" replace />;

  const needsOnboarding = profile?.role === "admin" && !restaurant;
  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <AppLayout />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <RootGate />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <RoleHome />,
      },
      {
        path: "dashboard",
        element: (
          <ProtectedRoute roles={["admin", "kitchen"]}>
            <DashboardPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "menu",
        element: (
          <ProtectedRoute roles={["admin"]}>
            <MenuPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "tables",
        element: (
          <ProtectedRoute roles={["admin"]}>
            <TablesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "orders",
        element: (
          <ProtectedRoute roles={["admin", "waiter"]}>
            <OrdersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "billing",
        element: (
          <ProtectedRoute roles={["admin", "waiter"]}>
            <BillingPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "kds",
        element: (
          <ProtectedRoute roles={["admin", "kitchen"]}>
            <KdsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "settings",
        element: (
          <ProtectedRoute roles={["admin"]}>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "users",
        element: (
          <ProtectedRoute roles={["admin"]}>
            <UsersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "billing/invoices",
        element: (
          <ProtectedRoute roles={["admin", "waiter"]}>
            <InvoiceHistoryPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "reports",
        element: (
          <ProtectedRoute roles={["admin"]}>
            <ReportsPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  {
    path: "/billing/invoice/:billId",
    element: (
      <ProtectedRoute roles={["admin", "waiter"]}>
        <InvoiceEmitPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/onboarding",
    element: (
      <ProtectedRoute roles={["admin"]}>
        <OnboardingPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
