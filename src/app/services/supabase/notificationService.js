import { runSupabaseRequest } from "./errors";

function notificationToApp(row = {}) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    responseId: row.response_id,
    dispatchId: row.dispatch_form_id,
    pcrId: row.pcr_report_id,
    read: Boolean(row.read_at),
    readAt: row.read_at,
    timestamp: row.created_at,
  };
}

export async function listNotifications({ unreadOnly = false, limit = 50 } = {}) {
  const rows = await runSupabaseRequest(client => {
    let query = client.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit);
    if (unreadOnly) query = query.is("read_at", null);
    return query;
  }, "Unable to load notifications.");

  return rows.map(notificationToApp);
}

export async function createNotification(notification) {
  return runSupabaseRequest(client =>
    client.from("notifications").insert({
      recipient_profile_id: notification.recipientProfileId || null,
      recipient_team_id: notification.recipientTeamId || null,
      type: notification.type || "system",
      title: notification.title,
      message: notification.message,
      response_id: notification.responseId || null,
      dispatch_form_id: notification.dispatchId || null,
      pcr_report_id: notification.pcrId || null,
    }).select("*").single(),
  "Unable to create notification.").then(notificationToApp);
}

export async function markNotificationAsRead(notificationId) {
  return runSupabaseRequest(client =>
    client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .select("*")
      .single(),
  "Unable to mark notification as read.").then(notificationToApp);
}

export async function updateNotificationPreferences(profileId, preferences) {
  return runSupabaseRequest(client =>
    client.from("notification_preferences").upsert({
      profile_id: profileId,
      in_app_enabled: preferences.inAppEnabled ?? true,
      email_enabled: preferences.emailEnabled ?? false,
      sms_enabled: preferences.smsEnabled ?? false,
      critical_only: preferences.criticalOnly ?? false,
    }).select("*").single(),
  "Unable to save notification preferences.");
}
