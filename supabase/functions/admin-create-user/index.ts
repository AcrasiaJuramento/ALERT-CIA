import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set(["dispatcher", "field_responder"]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Account provisioning is not configured." }, 500);
  }

  const authHeader = request.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return jsonResponse({ error: "Authentication is required." }, 401);

  const { data: adminRole, error: roleError } = await adminClient
    .from("profile_roles")
    .select("profile_id")
    .eq("profile_id", authData.user.id)
    .eq("role", "administrator")
    .maybeSingle();

  const { data: adminProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, account_status, deleted_at")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (roleError || profileError) return jsonResponse({ error: "Unable to verify administrator access." }, 500);
  if (!adminRole || adminProfile?.account_status !== "active" || adminProfile?.deleted_at) {
    return jsonResponse({ error: "Only active administrator accounts can create users." }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const name = cleanText(body.name);
  const email = cleanText(body.email).toLowerCase();
  const password = cleanText(body.password);
  const contact = cleanText(body.contact);
  const position = cleanText(body.position);
  const agency = cleanText(body.agency);
  const role = cleanText(body.role) || "field_responder";

  if (!name || !email || !password || !position || !agency || !contact) {
    return jsonResponse({ error: "Complete all required account details." }, 400);
  }
  if (!allowedRoles.has(role)) {
    return jsonResponse({ error: "Only Dispatcher and Field Officer accounts can be created here." }, 400);
  }
  if (password.length < 12) {
    return jsonResponse({ error: "Temporary password must be at least 12 characters." }, 400);
  }

  const { error: requestCleanupError } = await adminClient
    .from("admin_account_provisioning_requests")
    .delete()
    .eq("email", email)
    .is("consumed_at", null);

  if (requestCleanupError) {
    console.error("provisioning request cleanup failed", requestCleanupError);
    return jsonResponse({ error: requestCleanupError.message }, 500);
  }

  const { data: provisioningRequest, error: requestError } = await adminClient
    .from("admin_account_provisioning_requests")
    .insert({
      email,
      requested_role: role,
      requested_by: authData.user.id,
    })
    .select("id")
    .single();

  if (requestError || !provisioningRequest) {
    console.error("provisioning request insert failed", requestError);
    return jsonResponse({ error: requestError?.message || "Unable to authorize account creation." }, 500);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      created_by: "admin_user_management",
      created_by_profile_id: authData.user.id,
    },
    user_metadata: {
      display_name: name,
      name,
      contact_number: contact,
      position_title: position,
      agency,
      role,
    },
  });

  if (createError || !created.user) {
    console.error("auth.admin.createUser failed", createError);
    const { error: failedRequestCleanupError } = await adminClient
      .from("admin_account_provisioning_requests")
      .delete()
      .eq("id", provisioningRequest.id);
    if (failedRequestCleanupError) {
      console.error("provisioning request cleanup failed", failedRequestCleanupError);
    }
    return jsonResponse({ error: createError?.message || "Unable to create auth account." }, 400);
  }

  const profileId = created.user.id;
  const { error: profileUpsertError } = await adminClient
    .from("profiles")
    .upsert({
      id: profileId,
      display_name: name,
      email,
      contact_number: contact,
      position_title: position,
      agency,
      account_status: "active",
      deleted_at: null,
    });

  if (profileUpsertError) {
    console.error("profiles upsert failed", profileUpsertError);
    await adminClient.auth.admin.deleteUser(profileId).catch(error => console.error("auth cleanup failed", error));
    return jsonResponse({ error: profileUpsertError.message }, 500);
  }

  const { error: deleteRoleError } = await adminClient
    .from("profile_roles")
    .delete()
    .eq("profile_id", profileId);

  if (deleteRoleError) {
    console.error("profile_roles cleanup failed", deleteRoleError);
    await adminClient.auth.admin.deleteUser(profileId).catch(error => console.error("auth cleanup failed", error));
    return jsonResponse({ error: deleteRoleError.message }, 500);
  }

  const { error: insertRoleError } = await adminClient
    .from("profile_roles")
    .insert({ profile_id: profileId, role, assigned_by: authData.user.id });

  if (insertRoleError) {
    console.error("profile_roles insert failed", insertRoleError);
    await adminClient.auth.admin.deleteUser(profileId).catch(error => console.error("auth cleanup failed", error));
    return jsonResponse({ error: insertRoleError.message }, 500);
  }

  const { data: profile, error: fetchError } = await adminClient
    .from("profiles")
    .select("*, roles:profile_roles!profile_roles_profile_id_fkey(role), station:stations(id, name), team_members:team_members!team_members_profile_id_fkey(id, team_id, team_role, is_leader, left_at, team:responding_teams(id, name))")
    .eq("id", profileId)
    .single();

  if (fetchError) {
    console.error("provisioned profile fetch failed", fetchError);
    return jsonResponse({ error: fetchError.message }, 500);
  }
  return jsonResponse({ profile });
});
