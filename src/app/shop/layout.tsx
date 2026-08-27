import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ShopHeader from "./_components/ShopHeader";
import { CartProvider } from "./_lib/cart";

// Server-render check: user must be logged in and have a profile row.
// If admin, they can still preview the customer view.
async function requireCustomer() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/customer-login");

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("users")
    .select("id, phone, store_name, role, is_approved, is_blocked, credit_balance, credit_limit")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/customer-login");
  if (profile.is_blocked) redirect("/customer-login?blocked=1");
  if (!profile.is_approved) redirect("/customer-login?pending=1");
  return profile;
}

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();

  return (
    <CartProvider>
      <div className="min-h-screen bg-slate-50">
        <ShopHeader user={user} />
        <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6">{children}</main>
      </div>
    </CartProvider>
  );
}
