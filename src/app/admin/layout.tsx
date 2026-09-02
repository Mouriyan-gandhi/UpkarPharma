import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";

// Server-side role gate for the admin dashboard.
//
// Without this, any authenticated user (including customers) could navigate
// to /admin and see the admin UI shell — even though the API layer would
// still enforce role checks on data actions, the mere visibility of the
// admin surface leaks feature intent and breaks the security-through-
// obscurity contract (customers should not know an admin dashboard exists).
//
// getAdmin() verifies BOTH: valid Supabase session AND the caller's
// public.users row has role='admin' AND is_blocked=false. Anyone else
// gets bounced to /customer-login, matching the behavior of /shop/layout
// for the reverse case.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect("/customer-login");
  return <>{children}</>;
}
