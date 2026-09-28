// @ts-nocheck -- Supabase Edge Functions are checked by the Deno runtime on deploy.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function envKey(jsonName: string, legacyNames: string[]) {
  try {
    const values = JSON.parse(Deno.env.get(jsonName) || "{}");
    if (values.default) {
      const mappedName = String(values.default);
      const mappedValue = Deno.env.get(mappedName);
      if (mappedValue) return mappedValue;
      if (mappedName.startsWith("sb_") || mappedName.startsWith("eyJ"))
        return mappedName;
    }
  } catch {
    // Legacy projects expose individual variables instead of a JSON key map.
  }
  for (const name of legacyNames) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return "";
}

async function vapidKeys(admin: ReturnType<typeof createClient>) {
  const existing = await admin
    .from("loveloom_push_vapid")
    .select("public_key,private_key")
    .eq("singleton", true)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const generated = webpush.generateVAPIDKeys();
  const inserted = await admin.from("loveloom_push_vapid").insert({
    singleton: true,
    public_key: generated.publicKey,
    private_key: generated.privateKey,
  });
  if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
  if (!inserted.error)
    return { public_key: generated.publicKey, private_key: generated.privateKey };

  const raced = await admin
    .from("loveloom_push_vapid")
    .select("public_key,private_key")
    .eq("singleton", true)
    .single();
  if (raced.error) throw raced.error;
  return raced.data;
}

async function deliverPush(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: Record<string, unknown>,
  keys: { public_key: string; private_key: string },
) {
  const subscriptionsResult = await admin
    .from("loveloom_push_subscriptions")
    .select("id,endpoint,p256dh,auth_secret")
    .eq("user_id", userId);
  if (subscriptionsResult.error) throw subscriptionsResult.error;
  const subscriptions = subscriptionsResult.data || [];
  if (!subscriptions.length)
    return { delivered: 0, expired: 0, failed: 0 };

  webpush.setVapidDetails(
    "https://timaarzic.github.io/loveloom/",
    keys.public_key,
    keys.private_key,
  );
  let delivered = 0;
  let failed = 0;
  const expired: string[] = [];
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth_secret,
            },
          },
          JSON.stringify(payload),
          { TTL: 3600, urgency: "high" },
        );
        delivered += 1;
      } catch (error) {
        const status = Number((error as { statusCode?: number }).statusCode || 0);
        if (status === 404 || status === 410) expired.push(subscription.id);
        else failed += 1;
        console.error("LoveLoom push delivery failed", {
          subscriptionId: subscription.id,
          status,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }),
  );
  if (expired.length)
    await admin.from("loveloom_push_subscriptions").delete().in("id", expired);
  return { delivered, expired: expired.length, failed };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const publishableKey = envKey("SUPABASE_PUBLISHABLE_KEYS", [
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
    ]);
    const secretKey = envKey("SUPABASE_SECRET_KEYS", [
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
    const authorization = request.headers.get("Authorization") || "";
    if (!url || !publishableKey || !secretKey || !authorization)
      return response({ error: "Unauthorized" }, 401);

    const token = authorization.replace(/^Bearer\s+/i, "");
    const authClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userResult = await authClient.auth.getUser(token);
    const user = userResult.data.user;
    if (userResult.error || !user) return response({ error: "Unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const keys = await vapidKeys(admin);
    if (action === "key") return response({ publicKey: keys.public_key });
    if (action === "test") {
      const delivery = await deliverPush(
        admin,
        user.id,
        {
          title: "LoveLoom · уведомления включены",
          body: "Теперь тёплые сообщения не потеряются 💗",
          tag: "loveloom-push-ready",
          url: "?open=chat",
        },
        keys,
      );
      return response(delivery);
    }
    if (action !== "send-message") return response({ error: "Unknown action" }, 400);

    const messageId = String(body.messageId || "");
    if (!/^[0-9a-f-]{36}$/i.test(messageId))
      return response({ error: "Invalid message" }, 400);
    const messageResult = await admin
      .from("loveloom_messages")
      .select("id,room_id,author_id,created_at")
      .eq("id", messageId)
      .maybeSingle();
    const message = messageResult.data;
    if (messageResult.error || !message || message.author_id !== user.id)
      return response({ error: "Forbidden" }, 403);
    if (Date.now() - Date.parse(message.created_at) > 5 * 60_000)
      return response({ error: "Message is too old" }, 409);

    const membersResult = await admin
      .from("loveloom_room_members")
      .select("user_id")
      .eq("room_id", message.room_id)
      .neq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    const partnerId = membersResult.data?.user_id;
    if (membersResult.error || !partnerId) return response({ delivered: 0 });

    const claimed = await admin
      .from("loveloom_push_deliveries")
      .insert({ message_id: message.id });
    if (claimed.error?.code === "23505") return response({ delivered: 0, duplicate: true });
    if (claimed.error) throw claimed.error;

    const delivery = await deliverPush(
      admin,
      partnerId,
      {
        title: "LoveLoom · новое сообщение",
        body: "Ваш человек оставил вам что-то тёплое 💌",
        tag: `loveloom-room-${message.room_id}`,
        url: "?open=chat",
      },
      keys,
    );
    if (!delivery.delivered)
      await admin.from("loveloom_push_deliveries").delete().eq("message_id", message.id);
    return response(delivery);
  } catch (error) {
    console.error("LoveLoom push failed", error instanceof Error ? error.message : error);
    return response({ error: "Push delivery failed" }, 500);
  }
});
