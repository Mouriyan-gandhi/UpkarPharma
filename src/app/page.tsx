import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Root route — no visible UI; just routes users to the right home.
// - Admin → /admin
// - Customer → /shop
// - Anyone else → /customer-login
// The middleware still runs first, but leaves `/` alone so this server
// component can look up the role and pick the correct destination.
export default async function Root() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/customer-login");

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("users")
    .select("role, is_blocked, is_approved")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/customer-login");
  if (profile.role === "admin" && !profile.is_blocked) redirect("/admin");
  if (profile.is_approved && !profile.is_blocked) redirect("/shop");
  redirect("/customer-login");
}
