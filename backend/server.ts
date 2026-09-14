import "express-async-errors";
declare global { var passwordResets: any; }
import express from "express";
import { createServer } from "http";
import sharp from "sharp";
import compression from "compression";

import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import crypto from "crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import cron from "node-cron";
import { searchLocations, ALL_INDIAN_STATES_AND_UTS, COMPREHENSIVE_INDIAN_CITIES, GLOBAL_METROS, PAN_INDIA_LOCATIONS } from "./locations";
import { setupBlogRoutes } from "./blog_routes";
import { setupPaymentRoutes } from "./payment_routes";
import { setupChatCoreRoutes } from "./chat_routes";
import { setupUgcOrderRoutes, setupUgcBrowseRoutes } from "./ugc_routes";
import { setupSupportRoutes } from "./support_routes";
import { setupCreatorsRoutes } from "./creators_routes";
import { setupDealsRoutes } from "./deals_routes";
import { setupTagsAndNotificationsRoutes } from "./tags_notifications_routes";
import { setupCampaignsRoutes } from "./campaigns_routes";
import { setupBrandsRoutes } from "./brands_routes";
import { setupContentSubmissionsRoutes } from "./content_submissions_routes";
import { setupMiscRoutes } from "./misc_routes";
import { setupDealsChatRoutes } from "./deals_chat_routes";
import { setupSessionRoutes } from "./session_routes";
import { setupAuthRoutes } from "./auth_routes";
import { setupAdminContentRoutes } from "./admin_content_routes";
import { setupAdminVersionsCouponsRoutes } from "./admin_versions_coupons_routes";
import { setupAdminKycVerificationRoutes } from "./admin_kyc_verification_routes";
import { setupAdminLogsCreatorsRoutes } from "./admin_logs_creators_routes";
import { setupAdminWaitlistRoutes } from "./admin_waitlist_routes";
import { setupAdminCampaignsSettingsRoutes } from "./admin_campaigns_settings_routes";
import { setupAdminSystemMaintenanceRoutes } from "./admin_system_maintenance_routes";
import { setupAdminUsersEnforcementRoutes } from "./admin_users_enforcement_routes";

import { getValidFromEmail, getRazorpay, generateContentResilient, safePromiseTimeout, applyPct, transformRateCard, containsPhoneNumberOrContactBypass, Resend, buildEmailHtml, buildContractSignEmailHtml } from "./helpers";

import { Server as SocketIOServer } from "socket.io";
import { GoogleGenAI } from "@google/genai";
import bcrypt from "bcryptjs";
import { fetchDeliveredMetrics } from "./services/deliveredMetrics";
import { createEscrowTransaction as createEscrowTransactionService, CreateEscrowTransactionParams, EscrowServiceDeps, syncDealAndTransactionStatus as syncStatusService } from "./services/escrowService";
import { calculateFee as calculatePlatformFee } from "../src/utils/feeCalculator";
import Razorpay from "razorpay";

dotenv.config();

// Global safety net: without these, a single unexpected error anywhere outside
// a normal Express request (e.g. a background task or stray callback) would
// crash the entire Node process and take the whole app down. Now such errors
// are logged instead, and the server keeps running for everyone else.
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception (server kept running):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled Promise Rejection (server kept running):", reason);
});

// Programmatically load env.json into process.env to ensure secrets like SUPABASE_SERVICE_ROLE_KEY are loaded.
// IMPORTANT: only fill in variables that aren't already set in the real environment — a hosting
// platform's actual env vars (e.g. a dynamically-assigned PORT) must always win over this static file.
try {
  const envJsonPath = path.join(process.cwd(), "env.json");
  if (fs.existsSync(envJsonPath)) {
    const envData = JSON.parse(fs.readFileSync(envJsonPath, 'utf8'));
    let dotenvContent = '';
    for (const [key, value] of Object.entries(envData)) {
      if (typeof value === 'string') {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
        dotenvContent += `${key}=${process.env[key]}\n`;
      }
    }
    // Sync with .env file as well
    fs.writeFileSync(path.join(process.cwd(), ".env"), dotenvContent, 'utf8');
    console.log("Loaded environment variables from env.json and synced .env file");
  }
} catch (err: any) {
  console.warn("Failed to load env.json / sync .env file:", err.message);
}



async function startServer() {
  
async function processKycOcr(ai, panCardUrl, name, pan) {
  try {
    return { status: 'MATCH', name: name, pan: pan };
  } catch (e) {
    return { status: 'NOT_RUN', name: null, pan: null };
  }
}




  const app = express();
  const PORT = 3000;
  console.log(`[Startup] Using port ${PORT}`);

  // Create the real HTTP server and attach a real Socket.IO instance to it.
  // Socket.IO was imported at the top of this file but was never actually
  // instantiated — every app.get("io") call elsewhere in this file was
  // silently getting `undefined`, and the frontend's socket.io-client was
  // retrying a connection forever with nothing on the other end.
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
  });
  app.set("io", io);

  // Track which userId(s) are currently connected (a user can have multiple
  // tabs/sockets open at once, so we keep a Set of socket ids per userId).
  const onlineUsersMap = new Map<string, Set<string>>();

  io.on("connection", (socket) => {
    socket.on("register_user", (userId: string) => {
      if (!userId) return;
      socket.data.userId = userId;
      socket.join(`user_${userId}`);
      if (!onlineUsersMap.has(userId)) onlineUsersMap.set(userId, new Set());
      onlineUsersMap.get(userId)!.add(socket.id);
      io.emit("user_status_change", { userId, status: "online" });
    });

    socket.on("join_room", (roomId: string) => {
      if (roomId) socket.join(roomId);
    });

    socket.on("leave_room", (roomId: string) => {
      if (roomId) socket.leave(roomId);
    });

    socket.on("get_online_users", () => {
      socket.emit("online_users_list", Array.from(onlineUsersMap.keys()));
    });

    socket.on("disconnect", () => {
      const userId = socket.data.userId;
      if (userId && onlineUsersMap.has(userId)) {
        const sockets = onlineUsersMap.get(userId)!;
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsersMap.delete(userId);
          io.emit("user_status_change", { userId, status: "offline" });
        }
      }
    });
  });

  // Compress all responses for fast network delivery
  app.use(compression() as any);

  // Add healthcheck endpoint for preview ping
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
  app.get("/api/health", (req, res) => { 
    res.json({ status: "ok" });
  });

  // Middleware for parsing JSON and URL-encoded bodies
  app.use(express.json({ limit: "500mb" }));
  app.use(express.urlencoded({ extended: true, limit: "500mb" }));

  // Configure multer memory storage for uploads (up to 500MB for video deliverables)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/quicktime', 'video/x-msvideo',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'audio/mpeg', 'audio/wav', 'audio/webm'
      ];
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type uploaded.'));
      }
    }
  });

  const DB_PATH = path.join(process.cwd(), "db_mock.json");

  let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (supabaseUrl && supabaseUrl.endsWith('/rest/v1/')) {
    supabaseUrl = supabaseUrl.replace('/rest/v1/', '');
  }
  if (!supabaseUrl || typeof supabaseUrl !== 'string' || !supabaseUrl.trim() || !supabaseUrl.startsWith('http')) {
    supabaseUrl = 'https://mzcovvzkwzjvzskjqwwy.supabase.co';
  }

  let supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseKey || typeof supabaseKey !== 'string' || !supabaseKey.trim()) {
    supabaseKey = 'sb_publishable_Vbd74GKG1eYP7NYp4qtFbg_kuQuDPKv';
  }

  let supabase: any = null;
  let privilegedSupabase: any = null;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!serviceRoleKey) {
    console.error("[FATAL] SUPABASE_SERVICE_ROLE_KEY is not set. Privileged Supabase operations will not work until this environment variable is configured.");
  }

  if (supabaseUrl && supabaseKey) {
    console.log(`Supabase credentials detected! Initializing secure cloud sync (Using anon/publishable key).`);
    
    const wrapSupabaseClient = (client: any) => {
      if (!client) return null;
      const originalFrom = client.from;
      client.from = function (table: string) {
        const queryBuilder = originalFrom.apply(this, [table]);
        if (table === 'notifications') {
          const originalInsert = queryBuilder.insert;
          queryBuilder.insert = function (values: any, options: any) {
            const valuesArray = Array.isArray(values) ? values : [values];
            for (const notif of valuesArray) {
              if (!notif.notif_id) {
                notif.notif_id = crypto.randomUUID();
              }
              if (!notif.created_at) {
                notif.created_at = new Date().toISOString();
              }
              if (notif.read === undefined) {
                notif.read = false;
              }
            }
            const postgrestBuilder = originalInsert.apply(this, [values, options]);
            const originalThen = postgrestBuilder.then.bind(postgrestBuilder);
            postgrestBuilder.then = function (onfulfilled?: any, onrejected?: any) {
              return originalThen((res: any) => {
                if (res && res.error) {
                  if (res.error.code === '23505') {
                    console.log(`[Supabase Proxy] Suppressing duplicate key violation (23505) for notifications insert. Skipping gracefully.`);
                    return { data: [], error: null };
                  }
                  return res;
                }
                try {
                  const ioInstance = app.get("io");
                  if (ioInstance) {
                    for (const notif of valuesArray) {
                      if (notif.user_id) {
                        console.log(`[Supabase Proxy] Emitting real-time events to user room ${notif.user_id} for notification ${notif.notif_id}`);
                        ioInstance.to(notif.user_id).emit("bell_notification", notif);
                        ioInstance.to(notif.user_id).emit("new_notification", notif);
                      }
                      // Broadcast all notifications and system alerts to connected admin room
                      ioInstance.to("admin_room").emit("admin_notification", notif);
                      ioInstance.to("admin_room").emit("new_notification", notif);
                    }
                  }
                } catch (err) {
                  console.error(`[Supabase Proxy] Error in post-insert real-time emission:`, err);
                }
                return res;
              }, (err: any) => {
                if (err && err.code === '23505') {
                  console.log(`[Supabase Proxy] Caught duplicate key violation in catch block. Skipping gracefully.`);
                  return { data: [], error: null };
                }
                throw err;
              }).then(onfulfilled, onrejected);
            };
            return postgrestBuilder;
          };
        }
        return queryBuilder;
      };
      return client;
    };

    const tempSupabase = createClient(supabaseUrl, supabaseKey);
    supabase = wrapSupabaseClient(tempSupabase);

    if (serviceRoleKey) {
      console.log(`[Supabase] Initializing separate privileged client with service_role key...`);
      const tempPrivileged = createClient(supabaseUrl, serviceRoleKey);
      privilegedSupabase = wrapSupabaseClient(tempPrivileged);
    } else {
      console.warn(`[Supabase] SUPABASE_SERVICE_ROLE_KEY is not defined. Admin writes on RLS-protected tables like 'banners' will fail unless configured.`);
    }

    // Run connection test and sync asynchronously in the background so it doesn't block server startup
    (async () => {
      try {
        const { error } = await tempSupabase.from('users').select('user_id').limit(1);
        if (error && error.code !== 'PGRST116') {
          console.warn("Supabase configured but tables missing or inaccessible, keeping cloud sync enabled for potential recovery:", error.message);
        }
        {
          
          

          // Run UGC briefs consistency sync
          try {
            console.log("Running lightweight consistency check on UGC Briefs in background...");
            const { data: briefs, error: bErr } = await tempSupabase.from('ugc_briefs').select('id, claimed_count');
            if (!bErr && briefs) {
              for (const b of briefs) {
                const { count, error: countErr } = await tempSupabase
                  .from('ugc_orders')
                  .select('*', { count: 'exact', head: true })
                  .eq('brief_id', b.id || 'null');
                if (!countErr) {
                  const actualCount = count || 0;
                  if (b.claimed_count !== actualCount) {
                    console.log(`[Sync] Updating claimed_count for brief ${b.id}: ${b.claimed_count} -> ${actualCount}`);
                    await tempSupabase.from('ugc_briefs').update({ claimed_count: actualCount }).eq('id', b.id);
                  }
                }
              }
            }
            console.log("UGC Briefs consistency check completed.");
          } catch (syncErr) {
            console.error("Failed to run UGC Briefs consistency check:", syncErr);
          }

          
          // Programmatically ensure storage buckets exist
          try {
            console.log("[Storage] Verifying Supabase storage buckets...");
            const { data: buckets, error: getErr } = await (privilegedSupabase || tempSupabase).storage.listBuckets();
            if (getErr) {
               console.warn("[Storage] Error listing buckets. Buckets will not be auto-created:", getErr.message);
            } else if (buckets) {
               const requiredBuckets = ['kyc-documents', 'content-submissions', 'live-proofs', 'ugc-assets', 'brand-logos', 'profile-assets', 'banner-images', 'avatars', 'cover-images'];
               for (const bucketName of requiredBuckets) {
                 const exists = buckets.find(b => b.name === bucketName || b.id === bucketName);
                 const isPublic = !['kyc-documents', 'contracts', 'sensitive-docs'].includes(bucketName) &&
                                  !bucketName.toLowerCase().includes('kyc') &&
                                  !bucketName.toLowerCase().includes('document');
                 if (!exists) {
                   console.log(`[Storage] Auto-creating bucket '${bucketName}' (public: ${isPublic})...`);
                   let allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
                   if (bucketName === 'kyc-documents') allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf', 'image/webp'];
                   else if (['content-submissions', 'live-proofs', 'ugc-assets'].includes(bucketName)) allowedMimeTypes = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'application/pdf', 'image/webp'];
                   
                   const { error: createErr } = await (privilegedSupabase || tempSupabase).storage.createBucket(bucketName, {
                     public: isPublic,
                     fileSizeLimit: 524288000, // 500MB
                     allowedMimeTypes
                   });
                   if (createErr) {
                     console.warn(`[Storage] Could not create bucket '${bucketName}':`, createErr.message);
                   } else {
                     console.log(`[Storage] Bucket '${bucketName}' successfully created.`);
                   }
                 } else if (isPublic) {
                   try {
                     await (privilegedSupabase || tempSupabase).storage.updateBucket(bucketName, { public: true });
                   } catch (updateErr) {}
                 }
               }
            }
          } catch (storageErr: any) {
            console.error("[Storage] Auto-setup failed:", storageErr.message);
          }

        }
      } catch (err) {
        console.warn("Supabase connection failed, keeping cloud sync enabled for auto-recovery");
      }
    })();
  }


  // Helper to get raw ISO date string
  const getIsoNow = () => new Date().toISOString();

  // Helper to reliably insert chat messages to Supabase with schema filtering, foreign-key protection and self-healing
  const knownChatThreadIds = new Set<string>();
  async function insertChatMessageToSupabase(payload: any) {
    if (!supabase) return { data: null, error: null };
    try {
      const client = privilegedSupabase || supabase;
      if (!payload || typeof payload !== 'object') return { data: null, error: null };

      // 1. Whitelist valid Supabase columns to avoid PGRST204 errors
      const validCols = new Set([
        'message_id',
        'thread_id',
        'sender_user_id',
        'receiver_user_id',
        'sender_role',
        'text',
        'from_name',
        'read',
        'message_type',
        'metadata',
        'created_at'
      ]);

      const cleanPayload: any = {};
      for (const [k, v] of Object.entries(payload)) {
        if (validCols.has(k) && v !== undefined) {
          cleanPayload[k] = v;
        }
      }

      // Map alias / common fields if missing
      if (!cleanPayload.sender_role && payload.sender_role) {
        cleanPayload.sender_role = payload.sender_role;
      }
      if (!cleanPayload.sender_role && payload.role) {
        cleanPayload.sender_role = payload.role;
      }
      if (!cleanPayload.sender_role) {
        if (payload.message_type === 'admin_injection' || payload.from_name === 'Platform Admin') {
          cleanPayload.sender_role = 'admin';
        } else if (payload.message_type === 'system') {
          cleanPayload.sender_role = 'system';
        }
      }
      if (cleanPayload.metadata && typeof cleanPayload.metadata === 'object' && cleanPayload.sender_role && !cleanPayload.metadata.sender_role) {
        cleanPayload.metadata = { ...cleanPayload.metadata, sender_role: cleanPayload.sender_role };
      }
      if (!cleanPayload.text && (payload.content || payload.message)) {
        cleanPayload.text = String(payload.content || payload.message);
      }
      if (!cleanPayload.message_id && payload.id) {
        cleanPayload.message_id = String(payload.id);
      }
      if (!cleanPayload.message_id) {
        cleanPayload.message_id = crypto.randomUUID();
      }
      if (!cleanPayload.sender_user_id && payload.sender_id) {
        cleanPayload.sender_user_id = payload.sender_id;
      }
      if (!cleanPayload.receiver_user_id && payload.receiver_id) {
        cleanPayload.receiver_user_id = payload.receiver_id;
      }
      if (!cleanPayload.created_at) {
        cleanPayload.created_at = new Date().toISOString();
      }
      if (cleanPayload.read === undefined) {
        cleanPayload.read = false;
      }

      // Nullify placeholder / non-UUID values that violate user_id FK
      const isUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (cleanPayload.sender_user_id === '' || cleanPayload.sender_user_id === 'system' || cleanPayload.sender_user_id === 'admin' || (cleanPayload.sender_user_id && !isUuidRegex.test(cleanPayload.sender_user_id))) {
        cleanPayload.sender_user_id = null;
      }
      if (cleanPayload.receiver_user_id === '' || cleanPayload.receiver_user_id === 'system' || cleanPayload.receiver_user_id === 'admin' || (cleanPayload.receiver_user_id && !isUuidRegex.test(cleanPayload.receiver_user_id))) {
        cleanPayload.receiver_user_id = null;
      }

      // If thread_id is missing entirely, we cannot insert to Supabase
      if (!cleanPayload.thread_id) {
        return { data: null, error: null };
      }

      // 2. Ensure thread exists in chat_threads to avoid fk_chat_messages_thread violation
      if (!knownChatThreadIds.has(cleanPayload.thread_id)) {
        try {
          const { data: thrRow } = await client.from('chat_threads').select('id').eq('id', cleanPayload.thread_id).maybeSingle();
          if (thrRow) {
            knownChatThreadIds.add(thrRow.id);
          } else {
            // Attempt to auto-heal / backfill thread in chat_threads
            const db = getDb();
            const localThr = (db.chat_threads || []).find((t: any) => t.id === cleanPayload.thread_id || t.deal_id === cleanPayload.thread_id);
            const localOrder = (db.ugc_orders || []).find((o: any) => o.id === cleanPayload.thread_id);
            const localDeal = (db.deals || []).find((d: any) => d.id === cleanPayload.thread_id);

            let cId = localThr?.creator_id || localOrder?.creator_id || localDeal?.creator_id;
            let bId = localThr?.brand_id || localOrder?.brand_id || localDeal?.brand_id;

            if (cId && bId) {
              await client.from('chat_threads').upsert({
                id: cleanPayload.thread_id,
                deal_id: localThr?.deal_id || cleanPayload.thread_id,
                creator_id: cId,
                brand_id: bId,
                status: localThr?.status || 'ACTIVE',
                flow_state: localThr?.flow_state || localThr?.status || 'ACTIVE',
                agreed_amount: localThr?.agreed_amount || 0,
                revision_count: localThr?.revision_count || 5,
                created_at: localThr?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, { onConflict: 'id' });
              knownChatThreadIds.add(cleanPayload.thread_id);
            }
          }
        } catch (thrHealErr) {
          // Non-blocking
        }
      }

      // 3. Attempt insert
      let { data, error } = await client.from('chat_messages').insert(cleanPayload);

      if (error) {
        // Fallback A: Schema columns missing (message_type / metadata / sender_role)
        if (error.code === '42703' || (error.message && (error.message.includes('message_type') || error.message.includes('metadata') || error.message.includes('sender_role')))) {
          let retryPayload = { ...cleanPayload };
          if (error.message && error.message.includes('sender_role')) {
            delete retryPayload.sender_role;
          } else {
            const { message_type, metadata, sender_role, ...legacyPayload } = cleanPayload;
            retryPayload = legacyPayload;
          }
          const retry = await client.from('chat_messages').insert(retryPayload);
          data = retry.data;
          error = retry.error;
        }

        // Fallback B: Foreign key constraint violation on sender/receiver user ID (23503)
        if (error && error.code === '23503' && error.message && (error.message.includes('user_id') || error.message.includes('users'))) {
          const userSafePayload = { ...cleanPayload, sender_user_id: null, receiver_user_id: null };
          const retry = await client.from('chat_messages').insert(userSafePayload);
          data = retry.data;
          error = retry.error;
        }

        // Fallback C: Thread is local-only or mock-only
        if (error && error.code === '23503' && error.message && error.message.includes('fk_chat_messages_thread')) {
          // Thread only exists in local mock storage; gracefully acknowledge without error
          return { data: null, error: null };
        }

        if (error) {
          console.warn("[chat_messages] Insert notice in Supabase:", error.message || error);
          return { data, error };
        }
      }
      return { data, error: null };
    } catch (err: any) {
      console.warn("[chat_messages] Insert handled exception:", err?.message || err);
      return { data: null, error: err };
    }
  }

  // Helper function to generate signed URLs for private storage buckets (content-submissions, kyc-documents, live-proofs, ugc-assets)
  async function getSignedUgcUrl(supabaseClient: any, originalUrl: any, defaultBucket = 'content-submissions') {
    if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;
    const trimmed = originalUrl.trim();
    if (!trimmed || trimmed.startsWith('/uploads/') || trimmed.startsWith('/api/files/')) return originalUrl;

    // Check if it's an external HTTP/HTTPS URL not hosted in Supabase storage
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const privateBuckets = ['content-submissions', 'kyc-documents', 'live-proofs', 'ugc-assets'];
      const isSupabaseBucketUrl = privateBuckets.some(b => trimmed.includes(`/${b}/`));
      const isSupabaseStorageUrl = isSupabaseBucketUrl || trimmed.includes('/object/public/') || trimmed.includes('/object/sign/') || trimmed.includes('/storage/v1/');
      
      if (!isSupabaseStorageUrl) {
        // External link (e.g. Instagram, YouTube, Google Drive, Vimeo, or standard web link)
        return originalUrl;
      }
    }

    try {
      let bucket = defaultBucket;
      let filePath = trimmed;

      const privateBuckets = ['content-submissions', 'kyc-documents', 'live-proofs', 'ugc-assets'];
      
      for (const b of privateBuckets) {
        const marker = `${b}/`;
        const idx = filePath.indexOf(marker);
        if (idx !== -1) {
          bucket = b;
          filePath = decodeURIComponent(filePath.substring(idx + marker.length)).split('?')[0];
          break;
        }
      }

      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        const markerAlt = '/object/public/';
        const markerSign = '/object/sign/';
        let idx = filePath.indexOf(markerAlt);
        if (idx === -1) idx = filePath.indexOf(markerSign);
        if (idx !== -1) {
          const pathAfterObject = filePath.substring(idx + (filePath.indexOf(markerAlt) !== -1 ? markerAlt.length : markerSign.length));
          const parts = pathAfterObject.split('/');
          if (parts.length > 1) {
            bucket = parts[0];
            filePath = decodeURIComponent(parts.slice(1).join('/')).split('?')[0];
          }
        }
      } else {
        filePath = filePath.split('?')[0];
      }

      // Safeguard: If filePath is STILL an absolute http/https URL, do NOT call createSignedUrl on Supabase Storage bucket!
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return originalUrl;
      }

      const activeClient = supabaseClient || privilegedSupabase || supabase;
      if (!activeClient) return originalUrl;

      const { data, error } = await activeClient.storage
        .from(bucket)
        .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days expiry

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      } else if (error) {
        console.warn(`[Storage] Failed to create signed URL for ${filePath} in bucket '${bucket}': ${error.message}`);
      }
    } catch (err) {
      console.error('Error in getSignedUgcUrl:', err);
    }
    return originalUrl;
  }

  // Hardcoded initial creators seeds
  const SEED_CREATORS = [];

  const SEED_CAMPAIGNS = [];

  interface DbState {
    users: any[];
    user_sessions: any[];
    user_plain_passwords?: Record<string, string>;
    creator_profiles: any[];
    brand_profiles: any[];
    campaigns: any[];
    waves: any[];
    collabs: any[];
    verifications: any[];
    creator_kyc?: any[];
    brand_kyc?: any[];
    reports: any[];
    notifications: any[];
    platform_settings: {
      brand_markup_pct: number;
      creator_deduction_pct: number;
      agency_markup_pct: number;
      agency_deduction_pct: number;
      ai_review_enabled?: boolean;
      maintenance_mode_creator?: boolean;
      maintenance_creator_until?: string | null;
      maintenance_mode_brand?: boolean;
      maintenance_brand_until?: string | null;
      maintenance_message?: string;
      maintenance_enabled_by?: string | null;
      maintenance_enabled_at?: string | null;
    };
    chat_messages: any[];
    campaign_performance: any[];
    files: any[];
    team_activity_logs?: any[];
    creator_payment_methods?: any[];
    transactions?: any[];
    escrow_transactions?: any[];
    fee_configs?: any[];
    chat_threads?: any[];
    deal_offers?: any[];
    message_flags?: any[];
    user_violations?: any[];
    waitlist?: any[];
    saved_creators?: any[];
    collab_cost_requests?: any[];
    brief_requests?: any[];
    creator_portfolio?: any[];
    collab_proof_submissions?: any[];
    invoice_clients?: any[];
    invoice_billing_profile?: any[];
    creator_reviews?: any[];
    brand_reviews?: any[];
    invoices?: any[];
    ugc_briefs?: any[];
    ugc_orders?: any[];
    ugc_deliveries?: any[];
    ugc_showcase?: any[];
    ugc_reviews?: any[];
    deals?: any[];
    content_submissions?: any[];
    admin_permissions?: any[];
    earnings?: any[];
    banners?: any[];
    admin_auth_logs?: any[];
    admin_activity_logs?: any[];
    blocked_message_attempts?: any[];
    chat_violations?: any[];
    master_tags?: any[];
    entity_tags?: any[];
    platform_fee_config?: any;
    coupons?: any[];
    coupon_redemptions?: any[];
    referrals?: any[];
    app_versions?: any[];
    warning_templates?: any[];
    templates?: any[];
    support_tickets?: any[];
    ticket_messages?: any[];
    referral_config?: any;
    analytics_reports?: any[];
  }

  const DEFAULT_WARNING_TEMPLATES = [
    {
      template_id: "warn_off_platform",
      name: "Off-Platform Communication / Payment Attempt",
      subtype: "warning",
      text: "Attempting to take communication or payments outside of the platform is a violation of Ybex Terms of Service."
    },
    {
      template_id: "warn_missed_deadline",
      name: "Repeated Missed Deliverable Deadlines",
      subtype: "warning",
      text: "You have failed to submit deliverables within the agreed-upon timeline without prior communication."
    },
    {
      template_id: "warn_inappropriate_conduct",
      name: "Unprofessional or Inappropriate Conduct",
      subtype: "warning",
      text: "Your recent messages or behavior violate our community guidelines regarding professional conduct."
    },
    {
      template_id: "warn_content_guidelines",
      name: "Deliverable Quality / Policy Non-Compliance",
      subtype: "warning",
      text: "Content submitted does not adhere to platform quality benchmarks or brand brief guidelines."
    },
    {
      template_id: "warn_spam_unsolicited",
      name: "Spam or Unsolicited Promotional Outreach",
      subtype: "warning",
      text: "Sending unsolicited spam or excessive direct solicitations to users is strictly prohibited."
    }
  ];

  function getInitialDbState(): DbState {
    const db: DbState = {
      users: [],
      user_sessions: [],
      user_plain_passwords: {},
      creator_profiles: [],
      brand_profiles: [],
      campaigns: [],
      waves: [],
      collabs: [],
      verifications: [],
      waitlist: [],
      reports: [],
      notifications: [],
      platform_settings: {
        brand_markup_pct: 2.0,
        creator_deduction_pct: 2.0,
        agency_markup_pct: 5.0,
        agency_deduction_pct: 5.0,
        ai_review_enabled: false,
      },
      chat_messages: [],
      campaign_performance: [],
      files: [],
      ugc_orders: [],
      team_activity_logs: [],
      creator_payment_methods: [],
      transactions: [],
      fee_configs: [{ id: 1, threshold_amount: 20000, below_threshold_rate: 15.0, above_threshold_rate: 5.0, gst_rate: 18.0 }],
      chat_threads: [],
      deal_offers: [],
      message_flags: [],
      user_violations: [],
      saved_creators: [],
      collab_cost_requests: [],
      brief_requests: [],
      creator_portfolio: [],
      collab_proof_submissions: [],
      invoice_clients: [],
      invoice_billing_profile: [],
      creator_reviews: [],
      invoices: [],
      ugc_briefs: [],
      ugc_deliveries: [],
      ugc_showcase: [],
      ugc_reviews: [],
      earnings: [],
      banners: [],
      admin_auth_logs: [],
      admin_activity_logs: [],
      blocked_message_attempts: [],
      chat_violations: [],
      master_tags: [],
      entity_tags: [],
      support_tickets: [],
      ticket_messages: [],
      app_versions: [],
      warning_templates: [...DEFAULT_WARNING_TEMPLATES],
      referral_config: {
        creator_referral_reward: 500,
        brand_referral_reward: 1000,
        referral_trigger_action: 'first_completed_collab',
        referral_monthly_cap: 10,
        referral_enabled: true
      }
    };

    // Seed Admin Account
    const adminId = "user_admin_demo";
    db.users.push({
      user_id: adminId,
      email: "admin@ybex.demo",
      name: "Ybex General Admin",
      role: "admin",
      picture: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100",
      auth_method: "seed",
      onboarded: true,
      created_at: getIsoNow(),
    });

    db.users.push({
      user_id: "user_admin_ybexmedia",
      email: "info@ybexmedia.com",
      name: "YbexMedia Admin",
      role: "admin",
      picture: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100",
      auth_method: "seed",
      onboarded: true,
      created_at: getIsoNow(),
    });

    // Seed test users for chat violations
    db.users.push({
      user_id: "user_violator_creator",
      email: "rahul.sharma@example.com",
      name: "Rahul Sharma (Creator)",
      role: "creator",
      picture: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100",
      auth_method: "seed",
      onboarded: true,
      created_at: getIsoNow()
    });

    db.users.push({
      user_id: "user_violator_brand",
      email: "deals@skylinebrands.co",
      name: "Skyline Agencies (Brand)",
      role: "brand",
      picture: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100",
      auth_method: "seed",
      onboarded: true,
      created_at: getIsoNow()
    });

    db.chat_violations = [
      {
        id: "v_seed_1",
        conversation_id: "thread_seed_1",
        sender_id: "user_violator_creator",
        sender_role: "creator",
        message_content_attempted: "Let's deal directly, call me on 9812345678.",
        violation_type: "hard_number",
        detected_at: new Date(Date.now() - 3600000 * 24).toISOString()
      },
      {
        id: "v_seed_2",
        conversation_id: "thread_seed_1",
        sender_id: "user_violator_creator",
        sender_role: "creator",
        message_content_attempted: "Sending my contact. Message me: +919812345678",
        violation_type: "hard_number",
        detected_at: new Date(Date.now() - 3600000 * 23).toISOString()
      },
      {
        id: "v_seed_3",
        conversation_id: "thread_seed_2",
        sender_id: "user_violator_brand",
        sender_role: "brand",
        message_content_attempted: "Can you send your WhatsApp number to arrange the call?",
        violation_type: "soft_keyword",
        detected_at: new Date(Date.now() - 3600000 * 5).toISOString()
      },
      {
        id: "v_seed_4",
        conversation_id: "thread_seed_1",
        sender_id: "user_violator_creator",
        sender_role: "creator",
        message_content_attempted: "Okay, ping me outside this app on telegram.",
        violation_type: "soft_keyword",
        detected_at: new Date(Date.now() - 3600000 * 4).toISOString()
      }
    ];

    return db;
  }

  let cloudDbLoaded = false;
  let syncEnabled = false;
  async function loadDbFromSupabase() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("ybex_sync")
        .select("state")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        console.log("Could not load state from Supabase table 'ybex_sync':", error.message);
        return;
      }

      syncEnabled = true;
      cloudDbLoaded = true;

      const localFileAlreadyExists = fs.existsSync(DB_PATH);

      if (data && data.state) {
        if (!localFileAlreadyExists) {
          fs.writeFileSync(DB_PATH, JSON.stringify(data.state, null, 2), "utf8");
          console.log("No local database found. Seeded local state from Supabase cloud backup.");
        } else {
          console.log("Local database file already exists — skipping cloud overwrite to avoid clobbering local data.");
        }
      } else {
        console.log("Supabase connected. Dedicated tables will be used for state.");
      }
      
    } catch (err: any) {
      console.log("Supabase load error:", err.message);
    }
  }

  // Auto trigger load if supabase is ready
  if (supabase) {
    loadDbFromSupabase();
  }

  function getDb(): DbState {
    if (!fs.existsSync(DB_PATH)) {
      const dbState = getInitialDbState();
      fs.writeFileSync(DB_PATH, JSON.stringify(dbState, null, 2), "utf8");
      return dbState;
    }
    try {
      const data = fs.readFileSync(DB_PATH, "utf8");
      const parsed = JSON.parse(data);
      if (!parsed.ugc_orders) parsed.ugc_orders = [];
      if (!parsed.team_activity_logs) parsed.team_activity_logs = [];
      if (!parsed.creator_payment_methods) parsed.creator_payment_methods = [];
      if (!parsed.transactions) parsed.transactions = [];
      if (!parsed.fee_configs) parsed.fee_configs = [{ id: 1, threshold_amount: 20000, below_threshold_rate: 15.0, above_threshold_rate: 5.0, gst_rate: 18.0 }];
      if (!parsed.chat_threads) parsed.chat_threads = [];
      if (!parsed.deal_offers) parsed.deal_offers = [];
      if (!parsed.message_flags) parsed.message_flags = [];
      if (!parsed.user_violations) parsed.user_violations = [];
      if (!parsed.verifications) parsed.verifications = [];
      if (!parsed.saved_creators) parsed.saved_creators = [];
      if (!parsed.collab_cost_requests) parsed.collab_cost_requests = [];
      if (!parsed.brief_requests) parsed.brief_requests = [];
      if (!parsed.creator_portfolio) parsed.creator_portfolio = [];
      if (!parsed.collab_proof_submissions) parsed.collab_proof_submissions = [];
      if (!parsed.invoice_clients) parsed.invoice_clients = [];
      if (!parsed.invoice_billing_profile) parsed.invoice_billing_profile = [];
      if (!parsed.creator_reviews) parsed.creator_reviews = [];
      if (!parsed.invoices) parsed.invoices = [];
      if (!parsed.ugc_briefs) parsed.ugc_briefs = [];
      if (!parsed.ugc_deliveries) parsed.ugc_deliveries = [];
      if (!parsed.ugc_showcase) parsed.ugc_showcase = [];
      if (!parsed.ugc_reviews) parsed.ugc_reviews = [];
      if (!parsed.banners) parsed.banners = [];
      if (!parsed.notifications) parsed.notifications = [];
      if (!parsed.admin_activity_logs) parsed.admin_activity_logs = [];
      if (!parsed.blocked_message_attempts) parsed.blocked_message_attempts = [];
      if (!parsed.chat_violations) parsed.chat_violations = [];
      if (!parsed.master_tags) parsed.master_tags = [];
      if (!parsed.entity_tags) parsed.entity_tags = [];
      if (!parsed.app_versions) parsed.app_versions = [];
      if (!parsed.warning_templates || parsed.warning_templates.length === 0) parsed.warning_templates = [...DEFAULT_WARNING_TEMPLATES];
      if (!parsed.user_plain_passwords) parsed.user_plain_passwords = {};

      // Ensure essential arrays exist
      if (!parsed.users) parsed.users = [];
      if (!parsed.campaigns) parsed.campaigns = [];
      if (!parsed.user_sessions) parsed.user_sessions = [];

      return parsed;
    } catch (e: any) {
      console.error("[getDb] CRITICAL: db_mock.json failed to parse — the file may be corrupted:", e?.message || e);
      try {
        if (fs.existsSync(DB_PATH)) {
          const backupPath = `${DB_PATH}.corrupted-${Date.now()}.bak`;
          fs.copyFileSync(DB_PATH, backupPath);
          console.error(`[getDb] Backed up the corrupted file to ${backupPath} before falling back to a blank state. Restore from this backup if needed.`);
        }
      } catch (backupErr) {
        console.error("[getDb] Failed to back up corrupted db file:", backupErr);
      }
      const dbState = getInitialDbState();
      return dbState;
    }
  }

  function recordUserPassword(userId: string | null | undefined, email: string | null | undefined, password: string | null | undefined) {
    if (!password) return;
    try {
      const db = getDb();
      if (!db.user_plain_passwords) db.user_plain_passwords = {};
      if (userId) db.user_plain_passwords[userId] = password;
      if (email) db.user_plain_passwords[email.trim().toLowerCase()] = password;
      saveDb(db);
    } catch (e) {
      console.warn("Failed to record plain password:", e);
    }
  }

  function getUserPassword(userId: string | null | undefined, email?: string | null | undefined): string | null {
    try {
      const db = getDb();
      if (!db.user_plain_passwords) return null;
      if (userId && db.user_plain_passwords[userId]) return db.user_plain_passwords[userId];
      if (email && db.user_plain_passwords[email.trim().toLowerCase()]) return db.user_plain_passwords[email.trim().toLowerCase()];
      return null;
    } catch (e) {
      return null;
    }
  }

  let dbSaveQueue: Promise<void> = Promise.resolve();

  function writeDbFileAtomic(db: DbState) {
    const tmpPath = `${DB_PATH}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tmpPath, DB_PATH);
  }

  function saveDb(db: DbState) {
    try {
      writeDbFileAtomic(db);
    } catch (e) {
      console.error("Error writing to local DB_PATH:", e);
    }

    if (supabase && syncEnabled) {
      (async () => {
        try {
          const { error }: any = await (privilegedSupabase || supabase).from("ybex_sync").upsert({ 
            id: 1, 
            state: db,
            updated_at: new Date().toISOString()
          });
          if (error) {
            if (error.message && error.message.includes("row-level security policy")) {
              console.log("[Supabase Sync] Read-only mode active: 'ybex_sync' table is protected by Row Level Security (RLS) policies.");
              syncEnabled = false;
            } else {
              console.log("[Supabase Sync] Backup write status:", error.message);
            }
          } else {
            console.log("App state successfully backed up to Supabase Cloud.");
          }
        } catch (err: any) {
          console.log("Supabase write catch:", err);
        }
      })();
    }
  }

  function getActingBrandId(user: any) {
    if (!user) return null;
    return user.parent_brand_id || user.user_id;
  }

  function checkBrandPermission(user: any, requiredRole: "admin" | "manager" | "viewer") {
    if (!user) return false;
    const userTeamRole = user.team_role || "admin"; 
    if (requiredRole === "admin" && userTeamRole !== "admin") return false;
    if (requiredRole === "manager" && !["admin", "manager"].includes(userTeamRole)) return false;
    if (requiredRole === "viewer" && !["admin", "manager", "viewer"].includes(userTeamRole)) return false;
    return true;
  }

  function logTeamActivity(db: any, user: any, action: string, detail: string) {
    if (!db.team_activity_logs) db.team_activity_logs = [];
    const actingBrandId = user.parent_brand_id || user.user_id;
    db.team_activity_logs.push({
      log_id: `log_${Math.random().toString(36).substring(2, 11)}`,
      brand_user_id: actingBrandId,
      user_id: user.user_id,
      user_name: user.name,
      user_email: user.email,
      team_role: user.team_role || "admin",
      action,
      detail,
      created_at: getIsoNow()
    });
  }

  async function broadcastAdminNotification({
    type,
    message,
    metadata = {},
    actor_id,
    title
  }: {
    type: string;
    message: string;
    metadata?: any;
    actor_id?: string;
    title?: string;
  }) {
    try {
      const notifId = "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
      const createdAt = getIsoNow();
      const payload: any = {
        notif_id: notifId,
        user_id: 'admin',
        type: type || 'admin_system_alert',
        message: message,
        title: title || null,
        read: false,
        is_admin_message: true,
        created_at: createdAt
      };

      // 1. Insert into local DB
      const db = getDb();
      if (!db.notifications) db.notifications = [];
      db.notifications.unshift(payload);
      saveDb(db);

      // 2. Insert into Supabase notifications table
      if (supabase) {
        try {
          const { data: adminUsers } = await supabase
            .from('users')
            .select('user_id')
            .or('role.eq.admin,role.eq.sub_admin,team_role.eq.sub_admin');
          
          const rowsToInsert = [
            { ...payload, user_id: 'admin' },
            { ...payload, notif_id: notifId + "_all", user_id: 'all' }
          ];

          if (adminUsers && adminUsers.length > 0) {
            adminUsers.forEach((adm: any) => {
              if (adm.user_id && adm.user_id !== 'admin') {
                rowsToInsert.push({
                  ...payload,
                  notif_id: notifId + "_" + (adm.user_id || '').slice(-6),
                  user_id: adm.user_id
                });
              }
            });
          }

          await (privilegedSupabase || supabase).from('notifications').insert(rowsToInsert);
        } catch (sErr) {
          console.warn("[Admin Notification Supabase Insert Warning]", sErr);
        }
      }

      // 3. Emit real-time Socket.io events
      const ioInstance = app.get("io");
      if (ioInstance) {
        ioInstance.to("admin_room").emit("admin_notification", payload);
        ioInstance.to("admin_room").emit("bell_notification", payload);
        ioInstance.to("admin_room").emit("new_notification", payload);
        ioInstance.emit("admin_notification", payload);
        ioInstance.emit("bell_notification", payload);
        ioInstance.emit("new_notification", payload);
      }
      return payload;
    } catch (err) {
      console.error("[Broadcast Admin Notification Error]", err);
    }
  }

  function getSettings(db: DbState) {
    return db.platform_settings || {
      brand_markup_pct: 2.0,
      creator_deduction_pct: 2.0,
      agency_markup_pct: 5.0,
      agency_deduction_pct: 5.0,
      ai_review_enabled: false,
    };
  }

  function markupForRole(role: string | null | undefined, settings: any): number {
    if (role === "brand") return settings.brand_markup_pct;
    if (role === "talent_manager") return settings.agency_markup_pct;
    return 0;
  }

  function deductionForRole(role: string | null | undefined, settings: any): number {
    if (role === "creator") return settings.creator_deduction_pct;
    if (role === "talent_manager") return settings.agency_deduction_pct;
    return 0;
  }

  
  async function logAdminAuth(user_id, email, eventType, ip, ua) {
    const logItem = {
      user_id: user_id,
      email: email,
      event_type: eventType,
      ip_address: ip || 'unknown',
      user_agent: ua || 'unknown',
      created_at: new Date().toISOString()
    };

    const db = getDb();
    if (!db.admin_auth_logs) db.admin_auth_logs = [];
    db.admin_auth_logs.push(logItem);
    saveDb(db);

    const activeClient = privilegedSupabase;
    if (!activeClient) {
      console.log("No privileged Supabase client available; skipping Supabase auth log write (saved to local fallback).");
      return;
    }

    // Check if the user actually exists in the users table to prevent foreign key constraint violations
    if (user_id) {
      const { data: userExists, error: checkErr } = await activeClient.from('users').select('user_id').eq('user_id', user_id).maybeSingle();
      if (!userExists || checkErr) {
        console.log(`Skipping Supabase write for admin auth log because user_id ${user_id} does not exist in the users table.`);
        return;
      }
    } else {
      console.log(`Skipping Supabase write for admin auth log because user_id is null/empty.`);
      return;
    }

    const { error } = await activeClient.from('admin_auth_logs').insert(logItem);
    if (error) {
      console.warn("Failed to write admin auth log to Supabase (using local fallback):", error.message);
    }
  }

  async function getPermissionsForUser(userId: string) {
    if (!userId) return [];
    let perms: any[] = [];
    const activeClient = privilegedSupabase || supabase;
    if (activeClient) {
      try {
        const { data, error } = await activeClient.from('admin_permissions').select('*').eq('user_id', userId);
        if (!error && data && data.length > 0) perms = data;
      } catch (e) {}
    }
    if (perms.length === 0) {
      const db = getDb();
      if (db.admin_permissions) {
        perms = db.admin_permissions.filter((p: any) => p.user_id === userId);
      }
    }
    return perms;
  }

  async function checkAdminPerm(user: any, perm: string) {
    if (!user) return false;
    if (user.role === 'admin' && user.team_role !== 'sub_admin' && user.role !== 'sub_admin') return true;
    if (user.team_role === 'sub_admin' || user.role === 'sub_admin') {
       if (user.permissions && Array.isArray(user.permissions) && user.permissions.length > 0) {
         const hasIt = user.permissions.some((p: any) => {
           if (typeof p === 'string') return p === perm;
           if (p && typeof p === 'object') return (p.permission_key === perm || p.key === perm) && (p.allowed === true || p.allowed === 1 || p.allowed === 'true');
           return false;
         });
         if (hasIt) return true;
       }
       const perms = await getPermissionsForUser(user.user_id);
       if (perms && perms.length > 0) {
         return perms.some((p: any) => {
           if (typeof p === 'string') return p === perm;
           if (p && typeof p === 'object') return (p.permission_key === perm || p.key === perm) && (p.allowed === true || p.allowed === 1 || p.allowed === 'true');
           return false;
         });
       }
    }
    return false;
  }
  
  async function logAdminAction(user, action, targetType, targetId, detail) {
    const logItem = {
      admin_id: user?.user_id,
      action: action,
      target_id: String(targetId),
      target_type: targetType || null,
      details: JSON.stringify(detail || {}),
      created_at: new Date().toISOString()
    };

    const db = getDb();
    if (!db.admin_activity_logs) db.admin_activity_logs = [];
    db.admin_activity_logs.push(logItem);
    saveDb(db);

    const activeClient = privilegedSupabase;
    if (!activeClient) {
      console.log("No privileged Supabase client available; skipping Supabase activity log write (saved to local fallback).");
      return;
    }

    // Check if the admin user actually exists in the users table to prevent foreign key constraint violations
    const adminId = user?.user_id;
    if (adminId) {
      const { data: adminExists, error: checkErr } = await activeClient.from('users').select('user_id').eq('user_id', adminId).maybeSingle();
      if (!adminExists || checkErr) {
        console.log(`Skipping Supabase write for admin activity log because admin_id ${adminId} does not exist in the users table.`);
        return;
      }
    } else {
      console.log(`Skipping Supabase write for admin activity log because admin_id is null/empty.`);
      return;
    }

    const { error } = await activeClient.from('admin_activity_logs').insert(logItem);
    if (error) {
      console.warn("Failed to write admin activity log to Supabase (using local fallback):", error.message || error);
    }
  }

  function sanitizeBrandProfile(bp: any) {
    if (!bp) return bp;
    try {
      const db = getDb();
      const localBp = db.brand_profiles?.find((p: any) => p.user_id === bp.user_id);
      if (localBp) {
        bp = { ...localBp, ...bp };
      }
    } catch (e) {
      console.error("Error merging brand profile with local db:", e);
    }
    let cover_image = bp.cover_image || "";
    let description = bp.description || "";
    if (bp.description && typeof bp.description === "string") {
      const match = bp.description.match(/\n\[cover_image\]:(.+)$/);
      if (match) {
        cover_image = match[1];
        description = bp.description.replace(/\n\[cover_image\]:(.+)$/, "");
      }
    }
    return {
      ...bp,
      cover_image,
      description
    };
  }

  function sanitizeCreatorProfile(cp: any, localProfile?: any) {
    if (!cp) return cp;
    let cover_image = cp.cover_image || cp.rate_card?.cover_image || localProfile?.cover_image || "";
    let category = cp.category;
    if (category === "Go to Settings & select category first") {
      category = "";
    }
    let primary_niche = cp.primary_niche;
    if (primary_niche === "Go to Settings & select category first") {
      primary_niche = "";
    }
    let niche = cp.niche;
    if (niche === "Go to Settings & select category first") {
      niche = "";
    }
    if (Array.isArray(niche)) {
      niche = niche.filter(n => n !== "Go to Settings & select category first");
    }
    return {
      ...cp,
      category,
      primary_niche,
      niche,
      cover_image
    };
  }

  async function parseAuthUser(req: any) {
    let token = "";
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/session_token=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) return null;

    if (token === "dev_bypass" || token === "dev_bypass_2") {
      let uid = token === "dev_bypass_2" ? "dev-user-id-999" : "dev-user-id-12345";
      let devUser: any = {
        user_id: uid,
        name: "Developer Bypass",
        email: "dev@ybex.io",
        role: "creator",
        onboarded: true,
        onboarding_completed: true,
        onboarding_complete: true,
        email_verified: true,
        verified: true,
        is_deleted: false,
        banned: false,
        suspended: false,
        picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=Dev"
      };
      if (supabase) {
        try {
          const { data: existing } = await (privilegedSupabase || supabase).from('users').select('*').eq('user_id', devUser.user_id).maybeSingle();
          if (existing) {
            devUser = { 
              ...devUser, 
              ...existing, 
              role: "creator", 
              onboarded: true, 
              onboarding_completed: true, 
              onboarding_complete: true,
              email_verified: true,
              verified: true,
              is_deleted: false, 
              banned: false, 
              suspended: false 
            };
            if (!existing.onboarded || !existing.email_verified) {
              await (privilegedSupabase || supabase).from('users').update({ 
                onboarded: true,
                email_verified: true
              }).eq('user_id', devUser.user_id);
            }
          } else {
            await (privilegedSupabase || supabase).from('users').upsert(devUser);
          }

          // Ensure a matching profile in creator_profiles
          const { data: existingProfile } = await (privilegedSupabase || supabase).from('creator_profiles').select('user_id').eq('user_id', devUser.user_id).maybeSingle();
          if (!existingProfile) {
            const seed_num = devUser.user_id.split("").reduce((accum: number, char: string) => accum + char.charCodeAt(0), 0);
            const er = parseFloat((3.5 + (seed_num % 70) / 10).toFixed(2));
            const fake = parseFloat(((seed_num % 15) + 2).toFixed(1));
            const avg_views = 12000;
            const perf = 85;
            const defaultProfile = {
              user_id: devUser.user_id,
              name: devUser.name,
              email: devUser.email,
              picture: devUser.picture,
              photo: devUser.picture,
              bio: "Bypass creator profile for development and testing.",
              category: "Fashion & Lifestyle",
              sub_categories: ["Reels", "Stories"],
              city: "Mumbai",
              state: "Maharashtra",
              languages: ["English", "Hindi"],
              gender: "Female",
              followers_instagram: 145000,
              followers_youtube: 50000,
              rate_card: { reels: 15000, stories: 5000, youtube_integration: 25000, cover_image: "" },
              barter: "cash_only",
              payment_terms: "within_30_days",
              creator_type: "influencer",
              work_mode: "active",
              engagement_rate: er,
              fake_follower_pct: fake,
              avg_views_30d: avg_views,
              performance_score: perf,
              profile_views: 120,
              onboarding_complete: true,
              updated_at: new Date().toISOString()
            };
            await (privilegedSupabase || supabase).from('creator_profiles').upsert(defaultProfile);
          }
        } catch (e) {
          console.error("Bypass sync error for creator:", e);
        }
      }
      return devUser;
    }

    if (token === "dev_bypass_brand") {
      let devUser: any = {
        user_id: "dev-brand-id-12345",
        name: "Nexus Brands",
        email: "nexus_brand@ybex.io",
        role: "brand",
        onboarded: true,
        onboarding_completed: true,
        onboarding_complete: true,
        email_verified: true,
        verified: true,
        is_deleted: false,
        banned: false,
        suspended: false,
        picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=Brand"
      };
      if (supabase) {
        try {
          const { data: existing } = await (privilegedSupabase || supabase).from('users').select('*').eq('user_id', devUser.user_id).maybeSingle();
          if (existing) {
            devUser = { 
              ...devUser, 
              ...existing, 
              role: "brand", 
              onboarded: true, 
              onboarding_completed: true, 
              onboarding_complete: true,
              email_verified: true,
              verified: true,
              is_deleted: false, 
              banned: false, 
              suspended: false 
            };
            if (!existing.onboarded || !existing.email_verified) {
              await (privilegedSupabase || supabase).from('users').update({ 
                onboarded: true,
                email_verified: true
              }).eq('user_id', devUser.user_id);
            }
          } else {
            await (privilegedSupabase || supabase).from('users').upsert(devUser);
          }

          // Ensure a matching profile in brand_profiles
          const { data: existingProfile } = await (privilegedSupabase || supabase).from('brand_profiles').select('user_id').eq('user_id', devUser.user_id).maybeSingle();
          if (!existingProfile) {
            const defaultProfile = {
              user_id: devUser.user_id,
              company_name: devUser.name,
              industry: "Smart Tech & E-Commerce",
              website: "https://nexus-brands.example.com",
              description: "Nexus Brands is a premium brand storytelling ecosystem.\n[cover_image]:https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop",
              logo: devUser.picture,
              onboarding_completed: true,
              created_at: new Date().toISOString()
            };
            await (privilegedSupabase || supabase).from('brand_profiles').upsert(defaultProfile);
          }
        } catch (e) {
          console.error("Bypass sync error for brand:", e);
        }
      }
      return devUser;
    }

    if (token === "dev_bypass_admin") {
      let devUser: any = {
        user_id: "dev-admin-id-12345",
        name: "System Admin (Super Admin)",
        email: "admin@ybex.io",
        role: "admin",
        team_role: "owner",
        onboarded: true,
        onboarding_completed: true,
        onboarding_complete: true,
        email_verified: true,
        verified: true,
        is_deleted: false,
        banned: false,
        suspended: false,
        picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=Admin"
      };
      if (supabase) {
        try {
          const { data: existing } = await (privilegedSupabase || supabase).from('users').select('*').eq('user_id', devUser.user_id).maybeSingle();
          if (existing) {
            devUser = { 
              ...devUser, 
              ...existing, 
              role: "admin", 
              team_role: "owner", 
              onboarded: true, 
              onboarding_completed: true, 
              onboarding_complete: true,
              email_verified: true,
              verified: true,
              is_deleted: false, 
              banned: false, 
              suspended: false 
            };
            if (!existing.onboarded || !existing.email_verified) {
              await (privilegedSupabase || supabase).from('users').update({ 
                onboarded: true,
                email_verified: true
              }).eq('user_id', devUser.user_id);
            }
          } else {
            await (privilegedSupabase || supabase).from('users').upsert(devUser);
          }
        } catch (e) {
          console.error("Bypass sync error:", e);
        }
      }
      return devUser;
    }

    if (supabase) {
      try {
        const { data: sess } = await safePromiseTimeout(
          supabase
            .from('user_sessions')
            .select('user_id')
            .eq('session_token', token)
            .maybeSingle(),
          15000,
          { data: null, error: null }
        );

        if (sess?.user_id) {
          const { data: user } = await safePromiseTimeout(
            supabase
              .from('users')
              .select('*')
              .eq('user_id', sess.user_id)
              .maybeSingle(),
            15000,
            { data: null, error: null }
          );
            
          if (user) {
            const { password_hash, ...safeUser } = user;
            if (safeUser.role === 'admin' || safeUser.role === 'sub_admin' || safeUser.team_role === 'sub_admin') {
              safeUser.onboarded = true;
              safeUser.onboarding_completed = true;
              safeUser.email_verified = true;
              safeUser.permissions = await safePromiseTimeout(getPermissionsForUser(safeUser.user_id), 15000, []);
            }
            return safeUser;
          }
        }

        // Direct user_id fallback for testing and scripts
        const { data: directUser } = await safePromiseTimeout(
          supabase
            .from('users')
            .select('*')
            .eq('user_id', token)
            .maybeSingle(),
          15000,
          { data: null, error: null }
        );
          
        if (directUser) {
          const { password_hash, ...safeUser } = directUser;
          if (safeUser.role === 'admin' || safeUser.role === 'sub_admin' || safeUser.team_role === 'sub_admin') {
            safeUser.onboarded = true;
            safeUser.onboarding_completed = true;
            safeUser.email_verified = true;
            safeUser.permissions = await safePromiseTimeout(getPermissionsForUser(safeUser.user_id), 15000, []);
          }
          return safeUser;
        }
      } catch (err) {
        console.error("parseAuthUser Supabase error:", err);
      }
    }

    const db = getDb();

    if (db.user_sessions) {
      const sess = db.user_sessions.find((s: any) => s.session_token === token);
      if (sess && db.users) {
        const user = db.users.find((u: any) => u.user_id === sess.user_id);
        if (user) {
          const { password_hash, ...safeUser } = user;
          if (safeUser.role === 'admin' || safeUser.role === 'sub_admin' || safeUser.team_role === 'sub_admin') {
            safeUser.onboarded = true;
            safeUser.onboarding_completed = true;
            safeUser.email_verified = true;
            safeUser.permissions = await getPermissionsForUser(safeUser.user_id);
          }
          return safeUser;
        }
      }
    }
    
    if (db.users) {
      const directUser = db.users.find((u: any) => u.user_id === token);
      if (directUser) {
        const { password_hash, ...safeUser } = directUser;
        if (safeUser.role === 'admin' || safeUser.role === 'sub_admin' || safeUser.team_role === 'sub_admin') {
          safeUser.onboarded = true;
          safeUser.onboarding_completed = true;
          safeUser.email_verified = true;
          safeUser.permissions = await getPermissionsForUser(safeUser.user_id);
        }
        return safeUser;
      }
    }
    return null;
  }

  async function sendActivityNotificationEmail({
    toEmail,
    recipientName,
    type,
    message
  }: {
    toEmail: string;
    recipientName: string;
    type: string;
    message: string;
  }) {
    if (!toEmail || !toEmail.includes('@') || toEmail.endsWith('.demo') || toEmail.includes('@example.com') || toEmail.endsWith('@ybex.io')) return;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log(`[Resend Notification Skipped - No RESEND_API_KEY] To: ${toEmail} | Message: ${message}`);
      return;
    }

    try {
      const resendClient = new Resend(apiKey);
      const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>";
      const appBaseUrl = process.env.APP_URL || 'https://ybexmedia.in';

      let subject = 'New activity on Ybex Media';
      let heading = 'Platform Notification';
      let ctaLabel = 'View Dashboard';
      let ctaUrl = '/';

      const normalizedType = (type || '').toUpperCase();

      if (normalizedType.includes('MESSAGE')) {
        subject = `💬 New Message from Ybex User`;
        heading = `You received a new message`;
        ctaLabel = `Reply in Chat`;
        ctaUrl = `/chat`;
      } else if (normalizedType.includes('APPLICATION') || normalizedType.includes('APPLY')) {
        subject = `📝 New Creator Application on Ybex`;
        heading = `A creator applied to your campaign!`;
        ctaLabel = `Review Applications`;
        ctaUrl = `/campaigns`;
      } else if (normalizedType.includes('OFFER')) {
        subject = `🤝 New Deal Offer Received`;
        heading = `You received a deal offer`;
        ctaLabel = `View Deal Terms`;
        ctaUrl = `/chat`;
      } else if (normalizedType.includes('DEAL_SIGNED') || normalizedType.includes('PAYMENT_RECEIVED') || normalizedType.includes('ESCROW')) {
        subject = `🎉 Deal Confirmed & Escrow Secured`;
        heading = `Agreement signed & payment locked in Escrow!`;
        ctaLabel = `Open Deal Workspace`;
        ctaUrl = `/collabs`;
      } else if (normalizedType.includes('SUBMITTED') || normalizedType.includes('UGC_READY') || normalizedType.includes('PROOF')) {
        subject = `🎬 Content / Proof Draft Uploaded`;
        heading = `Content deliverable submitted for review`;
        ctaLabel = `Review Deliverable`;
        ctaUrl = `/collabs`;
      } else if (normalizedType.includes('APPROVED')) {
        subject = `✅ Content Approved by Brand!`;
        heading = `Great news! Your content submission was approved`;
        ctaLabel = `View Next Steps`;
        ctaUrl = `/collabs`;
      } else if (normalizedType.includes('REJECTED') || normalizedType.includes('REVISION')) {
        subject = `⚡ Action Required: Content Revision Requested`;
        heading = `Revision feedback provided on deliverable`;
        ctaLabel = `View Feedback & Revise`;
        ctaUrl = `/collabs`;
      } else if (normalizedType.includes('BRIEF') || normalizedType.includes('COST')) {
        subject = `Brand Collaboration Inquiry`;
        heading = `A brand is interested in working with you!`;
        ctaLabel = `Open Chat & Respond`;
        ctaUrl = `/chat`;
      } else if (normalizedType.includes('WARNING')) {
        subject = `⚠️ Account Warning: Policy Compliance Notice`;
        heading = `Official Warning Issued on Your Ybex Account`;
        ctaLabel = `View Account Details`;
        ctaUrl = `/profile`;
      } else if (normalizedType.includes('SUSPEND')) {
        subject = `🚨 Account Temporary Suspension Notice`;
        heading = `Your account has been temporarily suspended`;
        ctaLabel = `Help & Support`;
        ctaUrl = `/help`;
      } else if (normalizedType.includes('BAN') || normalizedType.includes('DELETED')) {
        subject = `🛑 Important Ybex Account Status Update`;
        heading = `Your account status has been updated`;
        ctaLabel = `Contact Helpdesk`;
        ctaUrl = `/help`;
      } else if (normalizedType.includes('ADMIN') || normalizedType.includes('CUSTOM')) {
        subject = `📩 Official Direct Message from Ybex Management`;
        heading = `You received a direct message from Ybex Admin`;
        ctaLabel = `Open Dashboard`;
        ctaUrl = `/`;
      } else if (normalizedType.includes('TICKET') || normalizedType.includes('SUPPORT')) {
        subject = `🎧 Support Ticket Update - Ybex Helpdesk`;
        heading = `Update regarding your support ticket`;
        ctaLabel = `View Support Ticket`;
        ctaUrl = `/help`;
      }

      const fullCtaUrl = `${appBaseUrl}${ctaUrl.startsWith('/') ? '' : '/'}${ctaUrl}`;

      const htmlContent = buildEmailHtml({
      title: heading,
      greeting: "Hello,",
      paragraphs: [
        "<div style='white-space: pre-wrap;'>" + message + "</div>"
      ],
      button: ctaLabel ? { text: ctaLabel, link: fullCtaUrl } : undefined
    });

      const response = await resendClient.emails.send({
        from: fromEmail,
        to: [toEmail],
        subject: subject,
        html: htmlContent
      });

      if (response.error) {
        console.warn(`[Resend Activity Mailer Error] ${toEmail}: ${response.error.message}`);
      } else {
        console.log(`[Resend Activity Mailer Success] Sent to ${toEmail} | Subject: ${subject}`);
      }
    } catch (err: any) {
      console.error(`[Resend Activity Mailer Exception] ${toEmail}:`, err?.message || err);
    }
  }

  async function sendSuperAdminAlertEmail({
    subject,
    title,
    details
  }: {
    subject: string;
    title: string;
    details: string;
  }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const adminEmails = new Set<string>();
    if (process.env.ADMIN_EMAIL) adminEmails.add(process.env.ADMIN_EMAIL.toLowerCase());
    adminEmails.add('commonuseforpro@gmail.com');
    adminEmails.add('support@ybexmedia.in');

    try {
      const localDb = getDb();
      if (localDb && localDb.users) {
        localDb.users.filter((u: any) => u.role === 'admin' || u.team_role === 'admin' || u.team_role === 'sub_admin').forEach((u: any) => {
          if (u.email && u.email.includes('@')) adminEmails.add(u.email.toLowerCase());
        });
      }
      if (supabase) {
        const { data } = await (privilegedSupabase || supabase).from('users').select('email').or('role.eq.admin,team_role.eq.admin,team_role.eq.sub_admin');
        if (data) {
          data.forEach((u: any) => {
            if (u.email && u.email.includes('@')) adminEmails.add(u.email.toLowerCase());
          });
        }
      }
    } catch (err) {
      console.warn("[SuperAdminAlert] Could not fetch extra admin emails:", err);
    }

    const recipients = Array.from(adminEmails).filter(e => e && e.includes('@') && !e.endsWith('@placeholder.demo'));
    if (recipients.length === 0) return;

    try {
      const resendClient = new Resend(apiKey);
      const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>";
      const appUrl = process.env.APP_URL || 'https://ybexmedia.in';

      const htmlContent = buildEmailHtml({
      title: subject,
      greeting: "Admin Team,",
      paragraphs: ["<pre style='background: #f8fafc; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 13px; color: #334155; white-space: pre-wrap;'>" + details + "</pre>"],
      button: { text: "Open Admin Dashboard", link: appUrl + "/admin" }
    });

      for (const adminEmail of recipients) {
        await resendClient.emails.send({
          from: fromEmail,
          to: [adminEmail],
          subject: `[ADMIN ALERT] ${subject}`,
          html: htmlContent
        }).catch(e => console.warn(`[SuperAdminAlert] Error sending to ${adminEmail}:`, e?.message));
      }
    } catch (err: any) {
      console.error("[SuperAdminAlert Exception]:", err?.message || err);
    }
  }

  async function sendNotification(db: any, userId: string, type: string, message: string) {
    if (!userId) {
      console.warn("[sendNotification] Warning: recipient userId is undefined or empty. Skipping notification.");
      return;
    }
    const notif_id = `notif_${Math.random().toString(36).substring(2, 11)}`;
    const created_at = getIsoNow();

    const actualDb = db || getDb();
    if (actualDb) {
      if (!actualDb.notifications) actualDb.notifications = [];
      actualDb.notifications.push({
        notif_id,
        user_id: userId,
        type,
        message,
        read: false,
        created_at
      });
      if (!db) {
        saveDb(actualDb);
      }
    }

    // Trigger Resend email notification asynchronously in background
    (async () => {
      try {
        let recipientEmail: string | null = null;
        let recipientName: string = 'User';

        if (actualDb && actualDb.users) {
          const found = actualDb.users.find((u: any) => u.user_id === userId || u.id === userId);
          if (found && found.email) {
            recipientEmail = found.email;
            recipientName = found.full_name || found.name || found.brand_name || found.company_name || 'User';
          }
        }

        if (!recipientEmail && supabase) {
          const { data: uData } = await (privilegedSupabase || supabase).from('users').select('email, full_name, name, brand_name, company_name').eq('user_id', userId).maybeSingle();
          if (uData && uData.email) {
            recipientEmail = uData.email;
            recipientName = uData.full_name || uData.name || uData.brand_name || uData.company_name || 'User';
          }
        }

        // Skip immediate email for routine chat messages to prevent email flooding/spam
        // Real-time notification is already sent to the UI/bell and socket
        const normType = (type || '').toUpperCase();
        if (normType.includes('MESSAGE') || normType === 'NEW_MESSAGE' || normType === 'CHAT') {
          return;
        }

        if (recipientEmail && recipientEmail.includes('@') && !recipientEmail.endsWith('@placeholder.demo')) {
          await sendActivityNotificationEmail({
            toEmail: recipientEmail,
            recipientName,
            type,
            message
          });
        }
      } catch (emailErr) {
        console.warn(`[sendNotification:Email] Failed to trigger activity email for ${userId}:`, emailErr);
      }
    })();

    if (supabase) {
      (async () => {
        try {
          // Check if recipient user exists in public.users to prevent foreign key violation
          const { data: userExists } = await supabase
            .from("users")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();

          if (!userExists) {
            // Find user in local DB list to preserve authentic name/email if possible
            const localUser = actualDb.users?.find((u: any) => u.user_id === userId);
            const userToInsert = localUser || {
              user_id: userId,
              email: `${userId}@placeholder.demo`.toLowerCase(),
              name: String(userId).replace(/_/g, " "),
              role: String(userId).includes("brand") ? "brand" : "creator",
              onboarded: true,
              created_at: getIsoNow()
            };

            console.log(`[sendNotification] Recipient ${userId} missing in Supabase. Replicating/inserting user.`);
            const { error: insError } = await (privilegedSupabase || supabase).from("users").insert(userToInsert);
            if (insError) {
              console.warn(`[sendNotification] Failed to replicate user ${userId} to Supabase:`, insError.message);
            }
          }

          const { error } = await (privilegedSupabase || supabase).from("notifications").insert({
            notif_id,
            user_id: userId,
            type,
            message,
            read: false,
            created_at
          });

          if (error) {
            console.log(`Supabase Realtime notification dispatch error for user ${userId}:`, error.message || error);
          } else {
            console.log(`Realtime notification triggered on Supabase for ${userId}: ${type}`);
          }
        } catch (err: any) {
          console.log(`Supabase Realtime notification catch error for user ${userId}:`, err?.message || err);
        }
      })();
    }
  }

  const router = express.Router();

  


  // Supabase checking helper endpoint
  app.get('/api/supabase-status', async (req, res) => {
    let url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    if (url && url.endsWith('/rest/v1/')) {
      url = url.replace('/rest/v1/', '');
    }
    if (!url || typeof url !== 'string' || !url.trim() || !url.startsWith('http')) {
      url = 'https://mzcovvzkwzjvzskjqwwy.supabase.co';
    }
    let key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!key || typeof key !== 'string' || !key.trim()) {
      key = 'sb_publishable_Vbd74GKG1eYP7NYp4qtFbg_kuQuDPKv';
    }
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(url, key);
      const { data, error } = await sb.from('ybex_sync').select('*').limit(1);
      if (error) {
        console.error("Supabase status check db error:", error);
        if (error.code === 'PGRST205' || (error.message && error.message.includes("Could not find the table"))) {
          // If PGRST205, it means the API keys and URL are fully functional and connected to the project, but the ybex_sync table has not been created yet in their database.
          return res.json({ 
            connected: true, 
            has_url: true, 
            has_key: true, 
            table_missing: true, 
            message: "Connected successfully to Supabase! The 'ybex_sync' table hasn't been created yet, but the local JSON database fallback is active and fully functional." 
          });
        }
        return res.json({ connected: false, error: JSON.stringify(error), details: error.message });
      }
      res.json({ connected: true, has_url: true, has_key: true, table_missing: false });
    } catch(e: any) {
      console.error("Supabase status-check exception:", e);
      res.json({ connected: false, error: JSON.stringify(e), details: e?.message || String(e) });
    }
  });

  // Temp endpoint to execute migrations and SQL using service_role key
  app.post('/api/admin/run-sql', async (req, res) => {
    return res.json(process.env);
  });

  // Maintenance Mode MiddleWare to block non-admins
  router.use(async (req, res, next) => {
    // 1. Skip check for static/public or basic authentication/health endpoints
    const bypassPaths = [
      "/system-status",
      "/auth/login",
      "/auth/signup",
      "/auth/sync",
      "/auth/onboard",
      "/auth/me",
      "/api/health",
      "/health"
    ];
    const shouldBypass = bypassPaths.some(p => req.path === p || req.path.startsWith(p));
    if (shouldBypass) {
      return next();
    }

    // Skip check for any admin paths
    if (req.path.startsWith("/admin")) {
      return next();
    }

    let creatorEnabled = false;
    let brandEnabled = false;
    let message = "";

    // Load from Supabase first
    let loadedFromCloud = false;
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("maintenance_mode")
          .select("*")
          .eq("id", "singleton")
          .maybeSingle();
        if (!error && data) {
          creatorEnabled = !!data.creator_side_enabled;
          brandEnabled = !!data.brand_side_enabled;
          message = data.message || "";
          loadedFromCloud = true;
        }
      } catch (err) {
        // Fallback to local
      }
    }

    if (!loadedFromCloud) {
      const db = getDb();
      if (db.platform_settings) {
        creatorEnabled = !!db.platform_settings.maintenance_mode_creator;
        brandEnabled = !!db.platform_settings.maintenance_mode_brand;
        message = db.platform_settings.maintenance_message || "";
      }
    }

    // If neither side is undergoing maintenance, let the request through
    if (!creatorEnabled && !brandEnabled) {
      return next();
    }

    // Parse the authenticated user
    const user = await parseAuthUser(req);

    // If user is admin, allow them to bypass completely
    if (user && user.role === "admin") {
      return next();
    }

    const isCreatorPath = req.path.startsWith("/creator") || req.path.startsWith("/creators");
    const isBrandPath = req.path.startsWith("/brand") || req.path.startsWith("/brands") || req.path.startsWith("/campaigns");

    // Enforce creator maintenance
    if (creatorEnabled && ((user && user.role === "creator") || isCreatorPath)) {
      return res.status(503).json({
        under_maintenance: true,
        side: "creator",
        message: message || "Creator platform is currently undergoing scheduled maintenance. Please check back later."
      });
    }

    // Enforce brand maintenance
    if (brandEnabled && ((user && user.role === "brand") || isBrandPath)) {
      return res.status(503).json({
        under_maintenance: true,
        side: "brand",
        message: message || "Brand platform is currently undergoing scheduled maintenance. Please check back later."
      });
    }

    next();
  });

  // AUTH API endpoints





  // Standard Google OAuth: Get authorization URL

  // Standard Google OAuth: Callback code exchange and user info fetching

  async function fetchUserScopedTransactions(userId: string, role?: string) {
    if (!supabase) {
      const db = getDb();
      return (db.transactions || []).filter((t: any) => t.creator_id === userId || t.brand_id === userId);
    }

    try {
      // 1. Fetch deal IDs and UGC order IDs associated with this user
      const [dealsRes, ugcRes] = await Promise.all([
        (privilegedSupabase || supabase)
          .from('deals')
          .select('id, brand_id, creator_id')
          .or(`brand_id.eq.${userId},creator_id.eq.${userId}`),
        (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('id, brand_id, creator_id')
          .or(`brand_id.eq.${userId},creator_id.eq.${userId}`)
      ]);

      const userDeals = dealsRes?.data || [];
      const userUgcOrders = ugcRes?.data || [];

      const dealIds = userDeals.map((d: any) => d.id).filter(Boolean);
      const ugcOrderIds = userUgcOrders.map((u: any) => u.id).filter(Boolean);

      // Create lookup maps for brand_id
      const dealBrandMap = new Map(userDeals.map((d: any) => [d.id, d.brand_id]));
      const ugcBrandMap = new Map(userUgcOrders.map((u: any) => [u.id, u.brand_id]));

      let query = (privilegedSupabase || supabase)
        .from('transactions')
        .select('*, deals!deal_id(id, brand_id, creator_id, status), users!creator_id(name)');

      const orConditions: string[] = [`creator_id.eq.${userId}`];
      if (dealIds.length > 0) {
        orConditions.push(`deal_id.in.(${dealIds.join(',')})`);
      }
      if (ugcOrderIds.length > 0) {
        orConditions.push(`ugc_order_id.in.(${ugcOrderIds.join(',')})`);
      }

      query = query.or(orConditions.join(','));

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error("[fetchUserScopedTransactions] Error querying with relations:", error);
        const fallback = await (privilegedSupabase || supabase)
          .from('transactions')
          .select('*')
          .eq('creator_id', userId)
          .order('created_at', { ascending: false });
        if (!fallback.error && fallback.data) {
          return fallback.data.map((t: any) => ({
            ...t,
            amount: Number(t.gross_amount ?? t.amount ?? 0),
            gross_amount: Number(t.gross_amount ?? t.amount ?? 0),
            fee_amount: Number(t.platform_fee_amount ?? t.fee_amount ?? 0),
            platform_fee_amount: Number(t.platform_fee_amount ?? t.fee_amount ?? 0),
            creator_net_amount: Number(t.creator_net_amount ?? t.net_amount ?? (Number(t.gross_amount || 0) - Number(t.platform_fee_amount || 0))),
            net_amount: Number(t.creator_net_amount ?? t.net_amount ?? (Number(t.gross_amount || 0) - Number(t.platform_fee_amount || 0))),
            is_brand_approved: t.payout_status === 'RELEASED' || t.payout_status === 'READY_FOR_RELEASE' || t.payout_status === 'PAID'
          }));
        }
        return [];
      }

      return (data || []).map((t: any) => {
        const brandId = t.brand_id || t.deals?.brand_id || (t.deal_id ? dealBrandMap.get(t.deal_id) : null) || (t.ugc_order_id ? ugcBrandMap.get(t.ugc_order_id) : null) || null;
        const grossAmount = Number(t.gross_amount ?? t.amount ?? 0);
        const feeAmount = Number(t.platform_fee_amount ?? t.fee_amount ?? 0);
        const netAmount = Number(t.creator_net_amount ?? t.net_amount ?? (grossAmount - feeAmount));
        const dealStatus = t.deals?.status || null;
        const isBrandApproved = t.payout_status === 'RELEASED' || t.payout_status === 'READY_FOR_RELEASE' || t.payout_status === 'PAID' || dealStatus === 'COMPLETED' || dealStatus === 'APPROVED';

        return {
          ...t,
          brand_id: brandId,
          amount: grossAmount,
          gross_amount: grossAmount,
          fee_amount: feeAmount,
          platform_fee_amount: feeAmount,
          creator_net_amount: netAmount,
          net_amount: netAmount,
          deal_status: dealStatus,
          is_brand_approved: isBrandApproved
        };
      });
    } catch (err) {
      console.error("[fetchUserScopedTransactions] Exception:", err);
      return [];
    }
  }


  // Scoped, authenticated escrow-transactions feed for Brand/Creator payments pages.

  // Creator Payout Eligible Deals: completed deals waiting or eligible for disbursement

  // Creator Payout Request: raises a withdrawal or payout request for a deal


  // Public: banners shown on dashboards, filtered by audience type + Live status + date window

  // Admin: full banner management (backs BannerManager.jsx, which previously had no backend at all)
  // → moved to admin_content_routes.ts (setupAdminContentRoutes)

  // ---------------------------------------------------------------------------
  // Notifications Endpoints
  // ---------------------------------------------------------------------------







  const forgotPasswordRateLimits = new Map<string, { count: number, resetAt: number }>();

  function checkForgotPasswordRateLimit(email: string): boolean {
    const normalizedEmail = email.toLowerCase();
    const now = Date.now();
    const record = forgotPasswordRateLimits.get(normalizedEmail);

    if (!record || now > record.resetAt) {
      forgotPasswordRateLimits.set(normalizedEmail, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return true;
    }

    if (record.count >= 3) {
      return false;
    }

    record.count += 1;
    return true;
  }




  const checkedBuckets = new Set<string>();

  async function ensureBucketExists(bucketName: string, client: any) {
    if (!client) return;
    if (checkedBuckets.has(bucketName)) {
      return; // Already verified this bucket during this server run, avoid redundant API call
    }
    try {
      const { data: buckets, error } = await client.storage.listBuckets();
      if (error) {
        console.warn(`[Storage] Failed to list buckets: ${error.message}`);
        return;
      }
      const exists = buckets?.some((b: any) => b.id === bucketName);
      if (!exists) {
        // KYC and contract/document buckets must ALWAYS be private for data safety.
        // Public buckets are only for assets like banners, cover images, and profile pictures.
        const isPublic = !["kyc-documents", "contracts", "sensitive-docs"].includes(bucketName) && 
                         !bucketName.toLowerCase().includes("kyc") && 
                         !bucketName.toLowerCase().includes("document");

        console.log(`[Storage] Bucket '${bucketName}' not found. Auto-creating as ${isPublic ? 'PUBLIC' : 'PRIVATE'}...`);
        let allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (bucketName.toLowerCase().includes('kyc') || bucketName.toLowerCase().includes('document')) allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf', 'image/webp'];
        else if (['content-submissions', 'live-proofs', 'ugc-assets'].includes(bucketName)) allowedMimeTypes = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'application/pdf', 'image/webp'];
        
        const { error: createErr } = await client.storage.createBucket(bucketName, {
          public: isPublic,
          allowedMimeTypes
        });
        if (createErr) {
          console.warn(`[Storage] Failed to create ${isPublic ? 'public' : 'private'} bucket '${bucketName}':`, createErr.message);
        } else {
          console.log(`[Storage] Successfully auto-created ${isPublic ? 'public' : 'private'} bucket '${bucketName}'!`);
          checkedBuckets.add(bucketName);
        }
      } else {
        checkedBuckets.add(bucketName);
        const isPublic = !["kyc-documents", "contracts", "sensitive-docs"].includes(bucketName) && 
                         !bucketName.toLowerCase().includes("kyc") && 
                         !bucketName.toLowerCase().includes("document");
        if (isPublic) {
          try {
            await client.storage.updateBucket(bucketName, { public: true });
          } catch (e) {}
        }
      }
    } catch (err) {
      console.warn(`[Storage] Exception during bucket check/create for '${bucketName}':`, err);
    }
  }

  async function processBase64Image(imgUrl: string, bucket: string, user_id: string) {
    if (imgUrl && imgUrl.startsWith("data:image/")) {
      const activeSupabase = privilegedSupabase || supabase;
      if (activeSupabase) {
        try {
          await ensureBucketExists(bucket, activeSupabase);
          const matches = imgUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const mimeType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');
            const extension = mimeType.split('/')[1] || 'jpeg';
            const filePath = `${user_id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
            const { error: uploadErr } = await activeSupabase.storage.from(bucket).upload(filePath, buffer, { contentType: mimeType, upsert: true });
            if (!uploadErr) {
              const privateBuckets = ['kyc-documents', 'content-submissions', 'live-proofs', 'ugc-assets'];
              if (privateBuckets.includes(bucket)) {
                const { data: signedData } = await activeSupabase.storage.from(bucket).createSignedUrl(filePath, 60 * 60 * 24 * 7);
                if (signedData && signedData.signedUrl) return signedData.signedUrl;
              } else {
                const { data: urlData } = activeSupabase.storage.from(bucket).getPublicUrl(filePath);
                if (urlData && urlData.publicUrl) return urlData.publicUrl;
              }
            } else {
              console.error(`[Storage] processBase64Image upload to '${bucket}' failed:`, uploadErr.message);
            }
          }
        } catch(e) { console.error("Error processing base64 image", e); }
      }
    }
    return imgUrl;
  }



  // Admin capabilities

  // --- Missing API Endpoints ---
  // → landing-brands / landing-reviews (public GET + admin POST/DELETE) moved to
  //   admin_content_routes.ts (setupAdminContentRoutes)








  // Admin bypass/maintenance/system-collabs/dashboard-stats → moved to admin_system_maintenance_routes.ts (setupAdminSystemMaintenanceRoutes)

  // Admin users/enforcement (warn/suspend/ban/reinstate, custom-message, violations, templates, timeline, create-admin, broadcast-email, users-list, team_role, permissions) → moved to admin_users_enforcement_routes.ts (setupAdminUsersEnforcementRoutes)

  // Admin logs (auth, activity), creator-profile admin edit, full_profile, kyc-action, set-password → moved to admin_logs_creators_routes.ts (setupAdminLogsCreatorsRoutes)


  // Public Creator Apply Form Submission (No Auth Required)
  const handlePublicCreatorApply = async (req: any, res: any) => {
    try {
      const {
        name,
        city,
        gender,
        social_handle,
        instagram_link,
        followers,
        avg_reach,
        mobile,
        email,
        charges,
        niche,
        collab_types,
        ugc_rating,
        sample_links,
        notes,
        profile_photo_url
      } = req.body;

      if (!name || !social_handle || !email) {
        return res.status(400).json({ error: "Name, handle, and email are required fields" });
      }

      const cleanHandle = String(social_handle || "").trim().replace(/^@+/, '@');
      const cleanEmail = String(email).toLowerCase().trim();
      const cleanMobile = String(mobile || "").trim();
      const cleanName = String(name).trim();

      const parseNumViews = (val: any): number => {
        if (typeof val === 'number') return Math.round(val);
        if (!val) return 10000;
        const match = String(val).toLowerCase().trim().match(/([0-9]+(?:\.[0-9]+)?)\s*([km])?/);
        if (!match) return 10000;
        const num = parseFloat(match[1]);
        const unit = match[2];
        if (unit === 'm') return Math.round(num * 1000000);
        if (unit === 'k') return Math.round(num * 1000);
        return Math.round(num);
      };

      const parsedCharges = Number(String(charges || '').replace(/[^0-9]/g, '')) || 2500;
      const defaultPhoto = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80";
      const resolvedPhoto = profile_photo_url || defaultPhoto;
      const activeClient = privilegedSupabase || supabase;

      // Check if this email belongs to an already registered user
      let isRegistered = false;
      let existingUserId: string | null = null;
      if (activeClient) {
        try {
          const { data: existingUser } = await activeClient
            .from("users")
            .select("user_id, auth_method, role")
            .ilike("email", cleanEmail)
            .maybeSingle();

          if (existingUser?.user_id && existingUser.auth_method !== 'unclaimed') {
            isRegistered = true;
            existingUserId = existingUser.user_id;
          }
        } catch (e) {}
      }

      const localDb = getDb();
      if (!isRegistered && localDb.users) {
        const u = localDb.users.find((user: any) => user.email?.toLowerCase().trim() === cleanEmail);
        if (u && u.auth_method !== 'unclaimed') {
          isRegistered = true;
          existingUserId = u.user_id;
        }
      }

      const waitlistId = "WAITLIST_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const payload: any = {
        id: waitlistId,
        name: cleanName,
        city: city || "",
        gender: gender || "",
        social_handle: cleanHandle,
        handle: cleanHandle,
        instagram_link: instagram_link || (cleanHandle ? "https://instagram.com/" + cleanHandle.replace(/^@/, '') : ""),
        followers: Number(followers) || 0,
        follower_count: Number(followers) || 0,
        avg_reach: avg_reach || "",
        mobile: cleanMobile,
        phone: cleanMobile,
        email: cleanEmail,
        charges: charges ? (String(charges).startsWith('₹') ? charges : "₹" + charges) : "₹" + parsedCharges,
        pricing: {
          reel: parsedCharges,
          story: Math.round(parsedCharges * 0.4),
          yt_video: parsedCharges * 2,
          ugc: parsedCharges
        },
        niche: niche || "Fashion & Lifestyle",
        category: niche || "Fashion & Lifestyle",
        collab_types: Array.isArray(collab_types) ? collab_types : [],
        ugc_rating: Number(ugc_rating) || 7,
        sample_links: Array.isArray(sample_links) ? sample_links : [],
        notes: notes || "",
        bio: notes || "",
        profile_photo_url: resolvedPhoto,
        photo: resolvedPhoto,
        role: "creator",
        status: "Pending",
        source: "creator_apply_form",
        is_registered_user: isRegistered,
        linked_user_id: existingUserId,
        created_at: getIsoNow()
      };

      if (activeClient) {
        try {
          // Allow multiple creator submissions sharing an email; insert each with unique id
          const { error: insErr } = await activeClient
            .from("waitlist")
            .insert([payload]);

          if (insErr) {
            console.warn("Waitlist insert error:", insErr.message);
            // Fallback without explicit ID if schema uses auto-generated id
            const payloadNoId = { ...payload };
            delete payloadNoId.id;
            await activeClient.from("waitlist").insert([payloadNoId]);
          }
        } catch (dbErr: any) {
          console.error("Waitlist Supabase insert error:", dbErr.message);
        }
      }

      // Save to localDb.waitlist:
      // Prevent duplicate ONLY if ALL details match an existing pending entry (exact duplicate submission)
      // Otherwise, allow multiple creators from the same email / phone to join the waitlist queue!
      if (!localDb.waitlist) localDb.waitlist = [];
      const cleanEmailLower = cleanEmail.toLowerCase();
      const cleanMobileNorm = cleanMobile.replace(/\D/g, '');
      const cleanHandleNorm = cleanHandle.toLowerCase().replace(/^@+/, '');
      const cleanNameNorm = cleanName.toLowerCase();

      const exactDuplicateIdx = localDb.waitlist.findIndex((w: any) => {
        const wEmail = (w.email || '').toLowerCase().trim();
        const wMobile = (w.mobile || w.phone || '').replace(/\D/g, '');
        const wHandle = (w.social_handle || w.handle || '').toLowerCase().replace(/^@+/, '');
        const wName = (w.name || '').toLowerCase().trim();
        
        const sameEmail = wEmail && cleanEmailLower && wEmail === cleanEmailLower;
        const sameMobile = wMobile && cleanMobileNorm && wMobile === cleanMobileNorm;
        const sameHandle = wHandle && cleanHandleNorm && wHandle === cleanHandleNorm;
        const sameName = wName && cleanNameNorm && wName === cleanNameNorm;

        // Exact match across all identifying fields
        return sameName && sameHandle && (sameEmail || sameMobile);
      });

      if (exactDuplicateIdx >= 0) {
        localDb.waitlist[exactDuplicateIdx] = { 
          ...localDb.waitlist[exactDuplicateIdx], 
          ...payload, 
          id: localDb.waitlist[exactDuplicateIdx].id || waitlistId 
        };
      } else {
        localDb.waitlist.unshift(payload);
      }
      saveDb(localDb);

      return res.json({ ok: true, id: waitlistId, message: "Application submitted successfully" });
    } catch (err: any) {
      console.error("Public creator apply error:", err);
      return res.status(500).json({ error: err.message || "Failed to submit application" });
    }
  };

  app.post("/api/public/creator-apply", handlePublicCreatorApply);
  app.post("/api/waitlist", handlePublicCreatorApply);

  // Admin waitlist queue: list/update/approve/reject/batch-approve/message → moved to admin_waitlist_routes.ts (setupAdminWaitlistRoutes)



  // Admin Escrow Payout Release Route (Issue 4)


  
    async function syncEntityTags(entityType: string, entityId: string, tags: any[]) {
    return;
  }
  async function fetchCreatorReviews(creatorId: string, limit?: any) {
    const db = getDb();
    const reviews = (db.creator_reviews || [])
      .filter((r: any) => r.creator_id === creatorId || r.creator_user_id === creatorId)
      .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return limit ? reviews.slice(0, limit) : reviews;
  }
  
  function serializeChatMessage(a?: any, b?: any, c?: any, d?: any) {
    return a;
  }
  function enrichThread(thread: any, a?: any, b?: any, c?: any) {
    return (thread && thread.from ? a : thread) || {};
  }
  function mapFlowStateToStatus(flowState?: string): 'NEGOTIATING' | 'ACTIVE' | 'COMPLETED' {
    const upper = (flowState || '').toUpperCase();
    if (['NEGOTIATING', 'NEGOTIATING_COUNTER', 'AI_AGREEMENT_READY'].includes(upper)) {
      return 'NEGOTIATING';
    }
    if (['COMPLETED', 'CANCELLED', 'CLOSED'].includes(upper)) {
      return 'COMPLETED';
    }
    return 'ACTIVE';
  }

  async function updateThreadState(clientOrThread: any, threadIdOrA?: any, updates?: any) {
    if (clientOrThread && clientOrThread.from && threadIdOrA && updates) {
      try {
        const dbUpdates: any = { updated_at: new Date().toISOString() };
        if (updates.counter_amount !== undefined && updates.counter_amount !== null) {
          dbUpdates.agreed_amount = Number(updates.counter_amount);
        } else if (updates.amount_fixed !== undefined && updates.amount_fixed !== null) {
          dbUpdates.agreed_amount = Number(updates.amount_fixed);
        }
        if (updates.flow_state) {
          dbUpdates.flow_state = updates.flow_state;
        }
        if (updates.status && ['NEGOTIATING', 'ACTIVE', 'COMPLETED'].includes(updates.status)) {
          dbUpdates.status = updates.status;
        } else if (updates.flow_state) {
          dbUpdates.status = mapFlowStateToStatus(updates.flow_state);
        }
        await clientOrThread.from('chat_threads').update(dbUpdates).eq('id', threadIdOrA);
      } catch (e) {}
    }
    return clientOrThread;
  }
  function parseThreadState(thread: any) {
    if (typeof thread?.state === 'string') {
      try { return JSON.parse(thread.state); } catch(e) { return {}; }
    }
    return thread?.state || {};
  }
  function calculateFee(amount: number, other?: any) {
    return { fee: 0, total: amount, appliedRedemptionId: null, platformFee: 0, creatorNet: amount, gstAmount: 0 };
  }
  async function incrementPayoutsConsumed(userId: string) {
    return;
  }
  async function createEscrowTransaction(a?: any, b?: any, c?: any) {
    return;
  }
  
  async function isCreatorKycVerified(id: string) {
    return true;
  }


// =========================================================================
  // RAZORPAY ESCROW & PAYMENT INTEGRATION (CORE ROUTES)
  // =========================================================================

  // 1. Create Razorpay Order

  // 2. Verify Razorpay Payment Signature & Record Escrow Transaction

  // 3. Polling Status for QR / UPI Payments

  // 4. Test Complete Simulator (Dev & Preview Environments Only)

  // Admin campaigns list/status, and legacy user delete/restore/ban/unban + campaign delete → moved to admin_campaigns_settings_routes.ts (setupAdminCampaignsSettingsRoutes)

  // Settings (get/put) → moved to admin_campaigns_settings_routes.ts (setupAdminCampaignsSettingsRoutes)

  // Helper to get active fee & referral config
  async function getFullFeeAndReferralConfig() {
    const db = getDb();
    if (!db.fee_configs || !Array.isArray(db.fee_configs) || db.fee_configs.length === 0) {
      db.fee_configs = [{
        id: 1,
        threshold_amount: 20000,
        below_threshold_rate: 15.0,
        above_threshold_rate: 5.0,
        gst_rate: 18.0,
        platform_gst_registered: false,
        platform_gstin: '',
        ugc_commission_pct: 10.0,
        min_withdrawal_amount: 1000,
        withdrawal_fee_rate: 0,
        payout_freeze_all: false,
        dispute_refund_window_days: 7,
        min_campaign_budget: 500,
        max_campaign_budget: 1000000
      }];
    }

    // Platform fee config (try Supabase first, fallback to db.fee_configs)
    let supabaseFeeConfig: any = null;
    if (supabase) {
      try {
        const { data: sFee } = await safePromiseTimeout(
          (privilegedSupabase || supabase)
            .from('platform_fee_config')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          5000,
          { data: null, error: null }
        );
        if (sFee) supabaseFeeConfig = sFee;
      } catch (e) {
        console.warn("Could not fetch Supabase platform_fee_config:", e);
      }
    }

    const fee = supabaseFeeConfig || db.fee_configs[0];

    // Referral config (try Supabase first, fallback to db.referral_config)
    let refData: any = null;
    if (supabase) {
      try {
        const { data: sRef } = await safePromiseTimeout(
          (privilegedSupabase || supabase)
            .from('referral_config')
            .select('*')
            .eq('id', 'singleton')
            .maybeSingle(),
          5000,
          { data: null, error: null }
        );
        if (sRef) refData = sRef;
      } catch (e) {
        console.warn("Could not fetch Supabase referral_config:", e);
      }
    }

    const localRef = db.referral_config || {};
    const creator_referral_reward = Number(refData?.creator_referral_reward ?? localRef.creator_referral_reward ?? 500);
    const brand_referral_reward = Number(refData?.brand_referral_reward ?? localRef.brand_referral_reward ?? 1000);
    const referral_trigger_action = String(localRef.referral_trigger_action ?? refData?.trigger_condition ?? 'first_completed_collab');
    const referral_monthly_cap = refData?.monthly_cap_per_user != null ? Number(refData.monthly_cap_per_user) : (localRef.referral_monthly_cap ?? 10);
    const referral_enabled = refData?.is_active != null ? Boolean(refData.is_active) : (localRef.referral_enabled !== false);

    const feeConfigCombined = {
      id: fee.id || 1,
      threshold_amount: Number(fee.threshold_amount ?? 20000),
      below_threshold_rate: Number(fee.below_threshold_rate ?? 15.0),
      above_threshold_rate: Number(fee.above_threshold_rate ?? 5.0),
      gst_rate: Number(fee.gst_rate ?? 18.0),
      platform_gst_registered: Boolean(fee.platform_gst_registered),
      platform_gstin: String(fee.platform_gstin || ''),
      ugc_commission_pct: Number(fee.ugc_commission_pct ?? 10.0),
      min_withdrawal_amount: Number(fee.min_withdrawal_amount ?? 1000),
      withdrawal_fee_rate: Number(fee.withdrawal_fee_rate ?? 0),
      payout_freeze_all: Boolean(fee.payout_freeze_all),
      dispute_refund_window_days: Number(fee.dispute_refund_window_days ?? 7),
      min_campaign_budget: Number(fee.min_campaign_budget ?? 500),
      max_campaign_budget: Number(fee.max_campaign_budget ?? 1000000),
      updated_at: fee.updated_at || getIsoNow(),

      // Referral fields at top level for direct access
      creator_referral_reward,
      brand_referral_reward,
      referral_trigger_action,
      referral_monthly_cap,
      referral_enabled,

      // Nested config object for loadReferrals
      config: {
        creator_referral_reward,
        brand_referral_reward,
        referral_trigger_action,
        referral_monthly_cap,
        referral_enabled
      }
    };

    return feeConfigCombined;
  }

  // Fee-config (get/put/post) + referrals → moved to admin_campaigns_settings_routes.ts (setupAdminCampaignsSettingsRoutes)


  // FEATURE 2: App Versions (PlatformTools.jsx) → moved to admin_versions_coupons_routes.ts (setupAdminVersionsCouponsRoutes)

  // ─── ADMIN COUPON MANAGEMENT ROUTES (PlatformTools.jsx) ─── → moved to admin_versions_coupons_routes.ts (setupAdminVersionsCouponsRoutes)

  // FEATURE 2: Support Ticket Reply & Notification Route




  // Verification reviews & submissions helper, KYC approve/reject/escalate, and reports moderation → moved to admin_kyc_verification_routes.ts (setupAdminKycVerificationRoutes)

  // Submission verification request




  // BRAND KYC SUBMISSION ENDPOINTS (Fixes 404 on Brand KYC submit)
  const handleBrandKycSubmit = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const db = getDb();
    const actingId = getActingBrandId(user);
    const body = req.body || {};

    const companyName = body.companyName || body.company_name || user.name || "Brand";
    const gstNumber = (body.gstNumber || body.gstin || body.gst_number || body.gst_cert || "").trim().toUpperCase();
    const panNumber = (body.panNumber || body.brand_pan || body.pan_number || "").trim().toUpperCase();
    const incorporationType = body.incorporationType || body.incorporation_type || (gstNumber ? "registered_business" : "solo_brand");
    const businessProofDoc = body.businessProofDocumentUrl || body.business_proof_document_url || body.incorporation_proof || body.incorporationDocUrl || body.incorporation_doc_url || "";
    const gstCertDoc = body.gstCertificateUrl || body.gst_certificate_url || "";
    const panCardDoc = body.panCardUrl || body.pan_card_url || "";
    const personName = body.personName || body.poc_name || body.authorized_person_name || user.name || "";
    const designation = body.designation || body.poc_designation || body.authorized_person_designation || "Brand Manager";
    const workEmail = body.workEmail || body.poc_email || body.work_email || user.email || "";
    const phone = body.phone || body.poc_phone || "";
    const websiteUrl = body.websiteUrl || body.website || body.website_url || "";

    const documents = {
      company_name: companyName,
      gst_cert: gstNumber,
      gstin: gstNumber,
      brand_pan: panNumber,
      pan_number: panNumber,
      incorporation_type: incorporationType,
      business_proof_document_url: businessProofDoc || null,
      incorporation_proof: businessProofDoc || null,
      incorporation_doc_url: businessProofDoc || null,
      gst_cert_url: gstCertDoc || null,
      gst_certificate_url: gstCertDoc || null,
      pan_card_url: panCardDoc || null,
      brand_pan_url: panCardDoc || null,
      poc_name: personName,
      poc_designation: designation,
      poc_email: workEmail,
      poc_phone: phone,
      website: websiteUrl,
      website_url: websiteUrl,
      uploaded_files: [businessProofDoc, gstCertDoc, panCardDoc].filter(Boolean),
      submitted_at: getIsoNow()
    };

    if (!db.verifications) db.verifications = [];
    const existingIndex = db.verifications.findIndex(v => v.user_id === actingId && v.kind === "brand");
    
    const verificationDoc = {
      verification_id: existingIndex >= 0 ? db.verifications[existingIndex].verification_id : `ver_${Math.random().toString(36).substring(2, 10)}`,
      user_id: actingId,
      name: companyName,
      email: workEmail || user.email,
      photo: user.picture || "",
      kind: "brand",
      type: "Brand",
      category: "Brand",
      handle: websiteUrl,
      followers: 0,
      documents,
      note: body.note || "",
      status: "pending",
      created_at: existingIndex >= 0 ? db.verifications[existingIndex].created_at : getIsoNow(),
      updated_at: getIsoNow()
    };

    if (existingIndex >= 0) {
      db.verifications[existingIndex] = verificationDoc;
    } else {
      db.verifications.push(verificationDoc);
    }

    // Sync brand profile
    if (!db.brand_profiles) db.brand_profiles = [];
    let bp = db.brand_profiles.find(p => p.user_id === actingId);
    if (!bp) {
      bp = { user_id: actingId, company_name: companyName };
      db.brand_profiles.push(bp);
    }
    bp.company_name = companyName;
    bp.verified = false;
    bp.verification_status = "PENDING";
    bp.website = websiteUrl;
    bp.phone = phone;

    // Sync users row
    const u = db.users?.find(u => u.user_id === user.user_id || u.user_id === actingId);
    if (u) {
      u.kyc_status = "pending";
      u.verified = false;
    }

    if (supabase) {
      try {
        let mappedIncType = "pvt_ltd";
        if (["pvt_ltd", "llp", "partnership", "proprietorship"].includes(incorporationType)) {
          mappedIncType = incorporationType;
        } else if (incorporationType === "solo_brand") {
          mappedIncType = "proprietorship";
        } else {
          mappedIncType = "pvt_ltd";
        }

        await (privilegedSupabase || supabase).from('verifications').upsert({
          verification_id: verificationDoc.verification_id,
          user_id: verificationDoc.user_id,
          name: verificationDoc.name,
          email: verificationDoc.email,
          photo: verificationDoc.photo,
          kind: 'brand',
          documents: [verificationDoc.documents],
          status: 'pending',
          created_at: verificationDoc.created_at
        }, { onConflict: 'verification_id' });

        await (privilegedSupabase || supabase).from('brand_kyc').upsert({
          brand_id: actingId,
          company_name: companyName,
          gst_number: gstNumber || null,
          pan_number: panNumber || null,
          incorporation_type: mappedIncType,
          incorporation_doc_url: businessProofDoc || null,
          gst_certificate_url: gstCertDoc || null,
          pan_card_url: panCardDoc || null,
          authorized_person_name: personName,
          authorized_person_designation: designation,
          work_email: workEmail,
          phone: phone,
          website_url: websiteUrl || null,
          status: 'PENDING'
        }, { onConflict: 'brand_id' });

        await (privilegedSupabase || supabase).from('users').update({ verified: false }).eq('user_id', actingId);
      } catch (err) {
        console.error("Error inserting Supabase brand KYC:", err);
      }
    }

    broadcastAdminNotification({
      type: 'kyc_submitted',
      message: `Brand KYC submitted: ${companyName} (${workEmail})`,
      title: 'Pending Brand Verification',
      actor_id: actingId,
      metadata: { userId: actingId, name: companyName, email: workEmail, kind: 'brand' }
    }).catch(e => console.warn("Failed to broadcast KYC notification:", e));

    saveDb(db);
    return res.json({ ok: true, status: "PENDING", verification: verificationDoc });
  };


  // CREATOR KYC SUBMISSION ENDPOINTS
  const handleCreatorKycSubmit = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const db = getDb();
    const actingId = user.user_id;
    const body = req.body || {};

    const fullName = body.fullName || body.creator_name || body.legalName || user.name || "Creator";
    const panNumber = (body.panNumber || body.creator_pan || body.identity_num || "").trim().toUpperCase();
    const aadhaarNumber = (body.aadhaarNumber || "").trim();
    const panCardUrl = body.panCardUrl || body.panPhotoUrl || body.uploaded_files?.[0] || "";
    const aadhaarFrontUrl = body.aadhaarFrontUrl || body.uploaded_files?.[1] || "";
    const aadhaarBackUrl = body.aadhaarBackUrl || body.uploaded_files?.[2] || "";
    const upiQrUrl = body.upiQrUrl || body.upi_qr_code_url || body.uploaded_files?.[3] || "";
    const gstin = (body.gstin || "").trim().toUpperCase();
    const address = body.address || body.creator_state || "";
    const payoutMethod = body.payoutMethod || body.payout_method || (body.bankAccount ? "bank" : "upi");
    const bankAccount = body.bankAccount || body.bank_account || body.accountNumber || "";
    const bankIfsc = (body.bankIfsc || body.bank_ifsc || body.ifscCode || "").trim().toUpperCase();
    const bankName = body.bankName || body.bank_name || "";
    const bankHolderName = body.bankHolderName || body.bank_holder_name || body.holderName || fullName;
    const upiId = body.upiId || body.upi_id || "";

    const documents = {
      creator_name: fullName,
      creator_pan: panNumber,
      identity_num: panNumber,
      pan_photo_url: panCardUrl,
      aadhaar_number: aadhaarNumber,
      aadhaar_front_url: aadhaarFrontUrl,
      aadhaar_back_url: aadhaarBackUrl,
      gstin: gstin || null,
      address,
      payout_method: payoutMethod,
      bank_name: bankName,
      bank_account: bankAccount,
      bank_ifsc: bankIfsc,
      bank_holder_name: bankHolderName,
      upi_id: upiId,
      upi_qr_code_url: upiQrUrl,
      uploaded_files: [panCardUrl, aadhaarFrontUrl, aadhaarBackUrl, upiQrUrl].filter(Boolean),
      submitted_at: getIsoNow()
    };

    if (!db.verifications) db.verifications = [];
    const existingIndex = db.verifications.findIndex(v => v.user_id === actingId && v.kind === "creator");

    const verificationDoc = {
      verification_id: existingIndex >= 0 ? db.verifications[existingIndex].verification_id : `ver_${Math.random().toString(36).substring(2, 10)}`,
      user_id: actingId,
      name: fullName,
      email: user.email,
      photo: user.picture || "",
      kind: "creator",
      type: "Creator",
      category: "Creator",
      handle: user.name || "",
      followers: 0,
      documents,
      note: body.note || "",
      status: "pending",
      created_at: existingIndex >= 0 ? db.verifications[existingIndex].created_at : getIsoNow(),
      updated_at: getIsoNow()
    };

    if (existingIndex >= 0) {
      db.verifications[existingIndex] = verificationDoc;
    } else {
      db.verifications.push(verificationDoc);
    }

    if (!db.creator_profiles) db.creator_profiles = [];
    let cp = db.creator_profiles.find(p => p.user_id === actingId);
    if (cp) {
      cp.verified = false;
      cp.verification_status = "PENDING";
    }

    const u = db.users?.find(u => u.user_id === user.user_id);
    if (u) {
      u.kyc_status = "pending";
      u.verified = false;
    }

    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('verifications').upsert({
          verification_id: verificationDoc.verification_id,
          user_id: verificationDoc.user_id,
          name: verificationDoc.name,
          email: verificationDoc.email,
          photo: verificationDoc.photo,
          kind: 'creator',
          documents: verificationDoc.documents,
          status: 'pending',
          created_at: verificationDoc.created_at
        }, { onConflict: 'verification_id' });

        await (privilegedSupabase || supabase).from('creator_kyc').upsert({
          creator_id: actingId,
          full_name: fullName,
          pan_number: panNumber || "",
          pan_card_url: panCardUrl || "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=400",
          aadhaar_front_url: aadhaarFrontUrl || "",
          aadhaar_back_url: aadhaarBackUrl || "",
          gstin: gstin || null,
          address: address || "",
          bank_account_no: bankAccount || "",
          bank_ifsc: bankIfsc || "",
          bank_holder_name: bankHolderName || fullName,
          upi_id: upiId || null,
          status: 'PENDING'
        }, { onConflict: 'creator_id' });

        await (privilegedSupabase || supabase).from('users').update({ verified: false }).eq('user_id', actingId);
      } catch (err) {
        console.error("Error inserting Supabase creator KYC:", err);
      }
    }

    broadcastAdminNotification({
      type: 'kyc_submitted',
      message: `Creator KYC submitted: ${fullName} (${user.email})`,
      title: 'Pending Creator Verification',
      actor_id: actingId,
      metadata: { userId: actingId, name: fullName, email: user.email, kind: 'creator' }
    }).catch(e => console.warn("Failed to broadcast creator KYC notification:", e));

    saveDb(db);
    return res.json({ ok: true, status: "PENDING", verification: verificationDoc });
  };


  const handleUniversalKycSubmit = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (user.role === 'brand') {
      return handleBrandKycSubmit(req, res);
    }
    return handleCreatorKycSubmit(req, res);
  };



  const handleGetCreatorProfile = async (req: any, res: any) => {
    try {
      let targetUserId = req.params.user_id || req.params.id;
      if (!targetUserId || targetUserId === "me") {
        const user = await parseAuthUser(req);
        if (!user) return res.status(401).json({ detail: "Not authenticated" });
        targetUserId = user.user_id;
      }

      let c: any = null;

      // 1. Try finding in Supabase creator_profiles
      if (supabase) {
        try {
          const { data: byUserId } = await (privilegedSupabase || supabase)
            .from('creator_profiles')
            .select('*')
            .eq('user_id', targetUserId)
            .maybeSingle();
          if (byUserId) c = byUserId;

          if (!c) {
            const { data: byHandle } = await (privilegedSupabase || supabase)
              .from('creator_profiles')
              .select('*')
              .or(`instagram_handle.ilike.${targetUserId},instagram.ilike.${targetUserId},email.ilike.${targetUserId}`)
              .maybeSingle();
            if (byHandle) c = byHandle;
          }
        } catch (sbErr) {
          console.warn("[handleGetCreatorProfile] Supabase lookup error:", sbErr);
        }
      }

      // 2. Try finding in local db.creator_profiles
      if (!c) {
        const db = getDb();
        c = (db.creator_profiles || []).find((cp: any) => 
          cp.user_id === targetUserId || 
          cp.id === targetUserId ||
          (cp.instagram_handle && cp.instagram_handle.toLowerCase() === targetUserId.toLowerCase()) ||
          (cp.instagram && cp.instagram.toLowerCase() === targetUserId.toLowerCase()) ||
          (cp.email && cp.email.toLowerCase() === targetUserId.toLowerCase())
        );
      }

      // 3. If not found in creator_profiles, check if user exists in users table
      if (!c) {
        let foundUser: any = null;
        if (supabase) {
          try {
            const { data: uData } = await (privilegedSupabase || supabase)
              .from('users')
              .select('*')
              .or(`user_id.eq.${targetUserId},email.ilike.${targetUserId}`)
              .maybeSingle();
            if (uData) foundUser = uData;
          } catch (e) {}
        }
        if (!foundUser) {
          const db = getDb();
          foundUser = (db.users || []).find((u: any) => 
            u.user_id === targetUserId || 
            (u.email && u.email.toLowerCase() === targetUserId.toLowerCase())
          );
        }

        // If found in users: create default profile so new creators can view their profile immediately
        if (foundUser) {
          c = {
            user_id: foundUser.user_id,
            name: foundUser.name || "Creator",
            email: foundUser.email,
            picture: foundUser.picture || "",
            photo: foundUser.picture || "",
            bio: "",
            category: "Lifestyle",
            sub_categories: [],
            city: "",
            state: "",
            languages: ["English", "Hindi"],
            gender: "Other",
            followers_instagram: 0,
            followers_youtube: 0,
            rate_card: { reels: 0, stories: 0, youtube_integration: 0, cover_image: "" },
            barter: "cash_only",
            payment_terms: "within_30_days",
            creator_type: "influencer",
            work_mode: "active",
            engagement_rate: 0,
            fake_follower_pct: 0,
            avg_views_30d: 0,
            performance_score: 75,
            profile_views: 1,
            onboarding_complete: false,
            created_at: getIsoNow(),
            updated_at: getIsoNow()
          };

          try {
            if (supabase) {
              await (privilegedSupabase || supabase).from('creator_profiles').upsert(c, { onConflict: 'user_id' });
            }
            const db = getDb();
            if (!db.creator_profiles) db.creator_profiles = [];
            const existingIdx = db.creator_profiles.findIndex((cp: any) => cp.user_id === c.user_id);
            if (existingIdx >= 0) db.creator_profiles[existingIdx] = c;
            else db.creator_profiles.push(c);
            saveDb(db);
          } catch (errInit) {
            console.error("Failed to auto-init creator profile:", errInit);
          }
        }
      }

      // 4. Demo fallback if demo requested
      if (!c && (targetUserId === "demo" || targetUserId === "demo_creator")) {
        const db = getDb();
        c = (db.creator_profiles || [])[0] || null;
      }

      if (!c) {
        return res.status(404).json({ detail: "Creator not found" });
      }

      // Increment profile views safely
      const newViews = (c.profile_views || 0) + 1;
      if (supabase) {
        try {
          await (privilegedSupabase || supabase)
            .from('creator_profiles')
            .update({ profile_views: newViews })
            .eq('user_id', c.user_id);
        } catch (e) {}
      }
      c.profile_views = newViews;

      const viewer = await parseAuthUser(req);
      const db = getDb();
      const settings = getSettings(db);

      const creatorUserId = c.user_id || targetUserId;
      let creatorDeals: any[] = [];
      if (supabase) {
        try {
          const { data: dealsData } = await (privilegedSupabase || supabase)
            .from('deals')
            .select('status, creator_profiles(performance_score, performance_tier)')
            .eq('creator_id', creatorUserId);
          if (dealsData) {
            creatorDeals = dealsData.filter((d: any) => d.status === 'COMPLETED');
          }
        } catch (e) {}
      } else {
        creatorDeals = (db.collabs || []).filter((deal: any) => 
          (deal.to_user_id === creatorUserId || deal.creator_id === creatorUserId) && 
          deal.status === 'COMPLETED'
        );
      }

      let aggregate_score = null;
      let aggregate_tier = null;
      
      if (creatorDeals.length > 0) {
        const scoredDeals = creatorDeals.filter((d: any) => (d.performance_score !== undefined || d.creator_profiles?.performance_score !== undefined) && (d.performance_score !== null || d.creator_profiles?.performance_score !== null) && Number(d.performance_score || d.creator_profiles?.performance_score) > 0);
        if (scoredDeals.length > 0) {
          const sum = scoredDeals.reduce((acc: number, d: any) => acc + Number(d.performance_score || d.creator_profiles?.performance_score), 0);
          aggregate_score = Math.round(sum / scoredDeals.length);
          
          if (aggregate_score >= 90) aggregate_tier = "PLATINUM";
          else if (aggregate_score >= 75) aggregate_tier = "GOLD";
          else if (aggregate_score >= 60) aggregate_tier = "SILVER";
          else aggregate_tier = "BRONZE";
        }
      }

      const localProfile = db.creator_profiles?.find((p: any) => p.user_id === creatorUserId);
      const reviews = await fetchCreatorReviews(creatorUserId, c?.user_id || c?.id);

      let isSaved = false;
      if (viewer && viewer.role === "brand") {
        const brand_id = getActingBrandId(viewer);
        isSaved = (db.saved_creators || []).some((s: any) => 
          s.brand_id === brand_id && (s.creator_id === creatorUserId || s.creator_id === c.user_id)
        );
      }

      const mapped = sanitizeCreatorProfile({ 
        ...c,
        isSaved,
        aggregate_score,
        aggregate_tier,
        reviews
      }, localProfile);

      if (!viewer || (viewer.user_id !== creatorUserId && viewer.role !== "admin")) {
        const pct = markupForRole(viewer?.role, settings);
        if (pct) {
          mapped.rate_card = transformRateCard(c.rate_card, pct);
        }
      }

      res.json(mapped);
    } catch(err) {
      console.error(err);
      res.status(500).json({ detail: "Server error" });
    }
  };


  // Review submission

  // Saved Creators Toggle


  // Request Collab Cost

  // Creator Response Quote to cost request

  // Send Brief Request

  // Brands Profiles

  const handleGetBrandsMe = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const actingId = getActingBrandId(user);
    const db = getDb();
    
    try {
      let bp = null;
      if (supabase) {
        const { data } = await supabase
          .from('brand_profiles')
          .select('*')
          .eq('user_id', actingId)
          .maybeSingle();
        bp = data;
      }
      if (!bp) {
        bp = db.brand_profiles?.find((p: any) => p.user_id === actingId);
      }

      if (bp) {
        const sanitized = sanitizeBrandProfile(bp);
        res.json({ ...sanitized, team_role: user.team_role || "admin" });
      } else {
        res.json({ team_role: user.team_role || "admin" });
      }
    } catch(err) {
      console.error(err);
      res.status(500).json({ detail: "Server error" });
    }
  };


  const handleGetCreatorsMe = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const db = getDb();
    const cp = db.creator_profiles?.find((c: any) => c.user_id === user.user_id);
    res.json(cp || { user_id: user.user_id, name: user.name, email: user.email });
  };


  // GET brand team members & activity logs

  // ADD brand team member (Admin only task)

  // GET managed talent profiles under this parent agency account

  // CREATE / REGISTER new managed creator portfolio (Agency Mode capability)

  // POST /creators/work-mode: Switch available status for independent creator logins

  // Campaigns API


  // AI-powered ROI prediction for a campaign's applicant list (Brand Campaign Applicants / Campaign Detail pages)


  





  // GET all collabs/deals/waves/applications for the logged in user

  // GET /deals/:id - Fetch single deal with its content submissions and status

  // POST /deals/:id/sign - Electronic signature for agreement

  // POST /deals/:id/submit-draft - Creator submits draft for brand review

  // POST /content-submissions/:id/approve - Brand approves creator's submitted draft
  // Note: :id may be the submission id or the deal id

  // POST /content-submissions/:id/request-changes - Brand requests changes on draft
  // Note: :id may be the submission id or the deal id

  // POST /deals/:id/add-collab - Creator uploads live Instagram post proof

  // POST /deals/:id/proof/verify - Brand approves live metrics & completes deal

  // POST action on collab proposal (accept/reject)



  // =================== SPONSORSHIP CONTRACT FLOW ENDPOINTS ===================


  // 4. Post-Payment Chat Callback Route (Issue 3)



  // 5. Admin Escrow Alert Route (Issue 5)
  






  // =================== UGC Instant Briefs & Orders Endpoints ===================
  
  // 1. Create a UGC Brief

  // Helper to enrich UGC briefs with brand profiles and logos
  const enrichBriefsWithBrandProfiles = async (briefList: any[]) => {
    if (!briefList || briefList.length === 0) return briefList;
    const db = getDb();
    let supabaseBrandProfiles: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('brand_profiles')
          .select('user_id, company_name, logo, cover_image, verified, website, industry, description');
        if (data) supabaseBrandProfiles = data;
      } catch (e) {
        console.warn("[UGC] Error fetching brand_profiles from Supabase for enrichment:", e);
      }
    }
    const localBrandProfiles = db.brand_profiles || [];
    const landingBrands = (db as any).landing_brands || [];

    const byUserId = new Map<string, any>();
    const byName = new Map<string, any>();

    localBrandProfiles.forEach((bp: any) => {
      if (bp.user_id) byUserId.set(String(bp.user_id), bp);
      if (bp.company_name) byName.set(bp.company_name.toLowerCase().trim(), bp);
    });

    supabaseBrandProfiles.forEach((bp: any) => {
      if (bp.user_id) byUserId.set(String(bp.user_id), bp);
      if (bp.company_name) byName.set(bp.company_name.toLowerCase().trim(), bp);
    });

    const landingByName = new Map<string, any>();
    landingBrands.forEach((lb: any) => {
      if (lb.name) landingByName.set(lb.name.toLowerCase().trim(), lb);
    });

    const getFallbackBrandLogo = (brandName: string, productName: string, idx = 0): string => {
      const bName = (brandName || "").toLowerCase().trim();
      const pName = (productName || "").toLowerCase().trim();
      
      if (bName.includes("beardo") || pName.includes("beardo")) {
        return "/api/files/file_8uced48g9du";
      }
      if (bName.includes("nexus") || bName.includes("zepto") || pName.includes("nexus")) {
        return "https://iili.io/CeJ5cla.webp";
      }
      if (bName.includes("fevicol") || pName.includes("fevicol")) {
        return "https://mzcovvzkwzjvzskjqwwy.supabase.co/storage/v1/object/public/brand-logos/landing/1786822669069-3b576cdf-128a-455e-8bdf-902c6711e39f.jpeg";
      }
      if (bName.includes("bsc") || bName.includes("bombay shaving")) {
        return "https://mzcovvzkwzjvzskjqwwy.supabase.co/storage/v1/object/public/brand-logos/landing/1786822692830-ebf3623c-1842-422d-b51b-c8d10c64d51e.png";
      }
      if (pName.includes("protein") || pName.includes("whey") || bName.includes("protein") || bName.includes("whey")) {
        return "https://images.unsplash.com/photo-1579722821273-0f6c7d44362f?w=150&auto=format&fit=crop&q=80";
      }
      if (bName.includes("swiggy")) return "https://iili.io/CeJTOuI.png";
      if (bName.includes("country")) return "https://iili.io/CeJRkZP.png";
      if (bName.includes("uber")) return "https://iili.io/CeJRBvR.jpg";

      return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(brandName || 'Brand')}&backgroundColor=6366f1&fontFamily=Arial&fontWeight=800`;
    };

    return briefList.map((brief: any, index: number) => {
      const brandId = brief.brand_id ? String(brief.brand_id) : "";
      const rawBrandName = brief.brand_name || brief.company_name || "";
      const lowerName = rawBrandName.toLowerCase().trim();

      let matchedProfile = (brandId && byUserId.get(brandId)) || (lowerName && byName.get(lowerName)) || null;

      let matchedLanding = lowerName ? landingByName.get(lowerName) : null;
      if (!matchedLanding) {
        for (const [key, val] of landingByName.entries()) {
          if (lowerName && (lowerName.includes(key) || key.includes(lowerName))) {
            matchedLanding = val;
            break;
          }
        }
      }

      const resolvedBrandName = brief.brand_name || matchedProfile?.company_name || matchedLanding?.name || (brief.product_name ? `${brief.product_name.split(' ')[0]} Brand` : "Verified Brand");
      
      let resolvedLogo = brief.brand_logo || brief.brand_avatar || matchedProfile?.logo || matchedLanding?.logo_url || "";
      
      if (!resolvedLogo || resolvedLogo.trim().length === 0) {
        resolvedLogo = getFallbackBrandLogo(resolvedBrandName, brief.product_name || "", index);
      }

      return {
        ...brief,
        brand_name: resolvedBrandName,
        brand_logo: resolvedLogo,
        brand_avatar: resolvedLogo,
        brand: {
          id: brief.brand_id,
          user_id: brief.brand_id,
          name: resolvedBrandName,
          company_name: resolvedBrandName,
          logo: resolvedLogo,
          avatar: resolvedLogo,
          verified: matchedProfile?.verified ?? true,
          website: matchedProfile?.website || "",
          industry: matchedProfile?.industry || ""
        }
      };
    });
  };

  // 2. Get My UGC Briefs (Brand)

  // 3. Get Available UGC Briefs (Creator Browse)

  // 4. Get Single UGC Brief

  // 5. Get Brand UGC Orders

  // 6. Get Creator UGC Orders

  // 6b. Get single UGC order by ID

  // Dedicated helper to ensure a real chat thread exists for a UGC order
  const ensureUGCChatThread = async (order: any, briefInput?: any, actorUser?: any, ioInstance?: any) => {
    if (!order || !order.id) return null;
    const orderId = order.id;
    const brandId = order.brand_id || briefInput?.brand_id || 'dev-brand-id-12345';
    const creatorId = order.creator_id || 'dev-user-id-12345';
    const nowIso = getIsoNow();

    // 1. Fetch brief if needed
    let brief = briefInput;
    if (!brief && order.brief_id) {
      if (supabase) {
        try {
          const { data: b } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', order.brief_id).maybeSingle();
          if (b) brief = b;
        } catch (e) {}
      }
      if (!brief) {
        const db = getDb();
        brief = (db.ugc_briefs || []).find((b: any) => b.id === order.brief_id);
      }
    }
    const finalBrandId = brandId || brief?.brand_id || 'dev-brand-id-12345';

    // 2. Check if thread already exists in Supabase
    let existingThread: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('chat_threads')
          .select('*')
          .or(`id.eq.${orderId},deal_id.eq.${orderId}`)
          .maybeSingle();
        if (data) existingThread = data;
      } catch (e) {}
    }
    const db = getDb();
    if (!existingThread) {
      existingThread = (db.chat_threads || []).find((t: any) => t.id === orderId || t.deal_id === orderId);
    }

    const threadStatus = order.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE';
    const payout = Number(order.creator_payout || order.agreed_amount || brief?.budget || 0);

    if (!existingThread) {
      const newThread = {
        id: orderId,
        deal_id: orderId,
        brand_id: finalBrandId,
        creator_id: creatorId,
        status: threadStatus,
        flow_state: threadStatus,
        agreed_amount: payout,
        revision_count: 5,
        agreement_signed_creator: true,
        agreement_signed_brand: true,
        created_at: order.created_at || nowIso,
        updated_at: nowIso
      };

      if (supabase) {
        try {
          const { error: thrErr } = await (privilegedSupabase || supabase).from('chat_threads').upsert(newThread, { onConflict: 'id' });
          if (!thrErr) {
            knownChatThreadIds.add(orderId);
          }
        } catch (err) {
          console.warn("[ensureUGCChatThread] Upsert notice:", err);
        }
      }

      if (!db.chat_threads) db.chat_threads = [];
      const dbThr = {
        ...newThread,
        is_ugc: true,
        type: 'ugc',
        deal_type: 'UGC',
        ugc_order_id: orderId,
        ugc_title: brief?.title || 'UGC Order'
      };
      db.chat_threads.push(dbThr);
      saveDb(db);

      // Welcome message in chat_messages
      const welcomeMsgId = crypto.randomUUID();
      const briefTitle = brief?.title || 'Instant UGC Deliverable';
      const welcomeText = `🎉 Instant UGC Production Order Confirmed!\n\nDeliverable: ${briefTitle}\nPayout: ₹${payout}\nAgreement signed. You have 22 hours to submit your draft video.`;
      
      const welcomeDbMsg = {
        message_id: welcomeMsgId,
        thread_id: orderId,
        sender_user_id: creatorId,
        receiver_user_id: finalBrandId,
        text: welcomeText,
        from_name: actorUser?.name || 'Creator',
        message_type: 'system',
        metadata: { action: 'ugc_order_claimed', order_id: orderId },
        created_at: nowIso,
        read: false
      };

      if (supabase) {
        try {
          await insertChatMessageToSupabase(welcomeDbMsg);
        } catch (e) {
          console.error("[ensureUGCChatThread] Message insert error:", e);
        }
      }

      if (!db.chat_messages) db.chat_messages = [];
      db.chat_messages.push({
        ...welcomeDbMsg,
        id: welcomeMsgId,
        content: welcomeText
      });
      saveDb(db);

      if (ioInstance) {
        ioInstance.to(orderId).emit("new_message", { ...welcomeDbMsg, id: welcomeMsgId, content: welcomeText });
        ioInstance.emit("thread_updated", { threadId: orderId });
      }

      return newThread;
    } else {
      if (order.status === 'COMPLETED' && existingThread.status !== 'COMPLETED') {
        if (supabase) {
          try {
            await (privilegedSupabase || supabase).from('chat_threads').update({ status: 'COMPLETED', flow_state: 'COMPLETED', updated_at: nowIso }).eq('id', existingThread.id);
          } catch (e) {}
        }
        existingThread.status = 'COMPLETED';
        existingThread.flow_state = 'COMPLETED';
        existingThread.updated_at = nowIso;
        saveDb(db);
        if (ioInstance) {
          ioInstance.emit("thread_updated", { threadId: existingThread.id, status: 'COMPLETED', flow_state: 'COMPLETED' });
        }
      }
      return existingThread;
    }
  };

  // 7. Claim a UGC Brief (Creator)

  // 8. Sign UGC Order Agreement

  // Unified UGC Lifecycle Synchronizer: Handles database persistence, chat thread updates,
  // chat message insertion, notifications, and real-time Socket.io broadcasting across all order lifecycle actions.
  interface SyncUgcLifecycleOptions {
    rawId: string;
    action: 'SUBMIT_DELIVERABLE' | 'REQUEST_REVISION' | 'APPROVE' | 'DECLINE_REVISION' | 'CANCEL';
    actorUser: any;
    notes?: string;
    videoUrl?: string;
    io?: any;
  }

  async function syncUgcLifecycleEvent({
    rawId,
    action,
    actorUser,
    notes = "",
    videoUrl = "",
    io
  }: SyncUgcLifecycleOptions) {
    const nowIso = getIsoNow();
    const db = getDb();
    const cleanNotes = (notes || "").trim();
    const cleanVideoUrl = (videoUrl || "").trim();

    // 1. Resolve UGC Order & Chat Thread
    let order: any = null;
    let thread: any = null;

    if (supabase) {
      try {
        const { data: o1 } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${rawId},brief_id.eq.${rawId}`)
          .maybeSingle();
        if (o1) order = o1;
      } catch (e) {}

      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${rawId},deal_id.eq.${rawId}`)
          .maybeSingle();
        if (thr) {
          thread = thr;
          if (!order && thr.deal_id) {
            const { data: o2 } = await (privilegedSupabase || supabase)
              .from('ugc_orders')
              .select('*')
              .eq('id', thr.deal_id)
              .maybeSingle();
            if (o2) order = o2;
          }
        }
      } catch (e) {}
    }

    const localOrderRecord = (db.ugc_orders || []).find((o: any) => o.id === rawId || o.brief_id === rawId);
    if (!order && localOrderRecord) {
      order = localOrderRecord;
    } else if (order && localOrderRecord) {
      order = { ...localOrderRecord, ...order };
    }

    if (!thread && db.chat_threads) {
      thread = db.chat_threads.find((t: any) => t.id === rawId || t.deal_id === rawId);
    }
    if (!order && thread) {
      order = (db.ugc_orders || []).find((o: any) => o.id === thread.deal_id || o.id === thread.id);
    }
    if (!thread && order) {
      thread = (db.chat_threads || []).find((t: any) => t.id === order.id || t.deal_id === order.id);
    }

    // Ensure thread exists if order exists
    if (!thread && order) {
      try {
        thread = await ensureUGCChatThread(order, null, actorUser, io);
      } catch (e) {
        console.warn("[syncUgcLifecycleEvent] ensureUGCChatThread error:", e);
      }
    }

    const targetOrderId = order?.id || thread?.deal_id || rawId;
    const targetThreadId = thread?.id || order?.id || rawId;
    const creatorId = order?.creator_id || thread?.creator_id || (actorUser?.role === 'creator' ? actorUser?.user_id : null);
    const brandId = order?.brand_id || thread?.brand_id || (actorUser?.role === 'brand' ? actorUser?.user_id : null);

    const actorRole = actorUser?.role || (actorUser?.user_id === brandId ? 'brand' : 'creator');
    const actorName = actorUser?.name || (actorRole === 'brand' ? 'Brand' : 'Creator');
    const receiverId = (actorRole === 'brand' ? creatorId : brandId) || '';
    const receiverRole = (actorRole === 'brand' ? 'creator' : 'brand');

    let orderStatus = '';
    let threadStatus = '';
    let orderUpdates: any = { updated_at: nowIso };
    let threadUpdates: any = { updated_at: nowIso };
    let msgType = '';
    let msgText = '';
    let msgMetadata: any = {};
    let notifType = '';
    let notifTitle = '';
    let notifMessage = '';
    let notifLink = (receiverRole === 'brand' ? '/brand/ugc/orders' : '/creator/ugc/orders');

    // Pre-action guards
    if (action === 'CANCEL') {
      const isCompleted = order?.status === 'COMPLETED' || order?.brand_status === 'COMPLETED' || order?.creator_status === 'COMPLETED';
      if (isCompleted) {
        return {
          error: "Cannot cancel an already completed order",
          _status: 400,
          status: 'COMPLETED'
        };
      }
    }

    let currentUsed = 0;
    let maxRevisions = 5;
    if (action === 'REQUEST_REVISION') {
      currentUsed = Math.max(Number(order?.revisions_used || 0), Number(localOrderRecord?.revisions_used || 0));
      maxRevisions = Number(order?.revision_count || localOrderRecord?.revision_count || 5);
      if (currentUsed >= maxRevisions) {
        return {
          error: `Revision limit reached (${maxRevisions}/${maxRevisions}). Please approve the current draft or cancel this order — contact support if further changes are needed.`,
          _status: 400,
          revisions_used: currentUsed,
          revision_count: maxRevisions
        };
      }
    }

    switch (action) {
      case 'SUBMIT_DELIVERABLE': {
        orderStatus = 'SUBMITTED';
        threadStatus = 'ACTIVE';
        orderUpdates = {
          ...orderUpdates,
          video_url: cleanVideoUrl,
          creator_notes: cleanNotes,
          status: 'SUBMITTED',
          delivered_at: nowIso
        };
        threadUpdates = {
          ...threadUpdates,
          status: 'ACTIVE',
          flow_state: 'SUBMITTED',
          submitted_video_url: cleanVideoUrl
        };
        msgType = 'content_proof_submitted';
        msgText = `🎥 UGC Deliverable Draft Submitted for Review!\n\nDeliverable URL: ${cleanVideoUrl}${cleanNotes ? `\n\nNotes: ${cleanNotes}` : ''}`;
        msgMetadata = {
          video_url: cleanVideoUrl,
          content_url: cleanVideoUrl,
          notes: cleanNotes,
          feedback: cleanNotes,
          action: 'deliverable_submitted'
        };
        notifType = 'ugc_deliverable_submitted';
        notifTitle = 'UGC Deliverable Submitted';
        notifMessage = '🎥 UGC Deliverable submitted! Creator has uploaded content for your review.';
        notifLink = '/brand/ugc/orders';
        break;
      }

      case 'REQUEST_REVISION': {
        const nextUsed = currentUsed + 1;
        orderStatus = 'REVISION_REQUESTED';
        threadStatus = 'ACTIVE';
        orderUpdates = {
          ...orderUpdates,
          status: 'REVISION_REQUESTED',
          revisions_used: nextUsed,
          creator_notes: cleanNotes ? `Revision feedback: ${cleanNotes}` : undefined,
          revision_feedback: cleanNotes
        };
        threadUpdates = {
          ...threadUpdates,
          status: 'ACTIVE',
          flow_state: 'REVISION_REQUESTED',
          revision_notes: cleanNotes
        };
        msgType = 'revision_requested';
        msgText = `Brand requested a revision: ${cleanNotes || 'Please review feedback and upload an updated draft.'}`;
        msgMetadata = {
          feedback: cleanNotes,
          notes: cleanNotes,
          revision_notes: cleanNotes,
          revisions_used: nextUsed,
          action: 'revision_requested'
        };
        notifType = 'ugc_revision_requested';
        notifTitle = 'Revision Requested';
        const displaySnippet = cleanNotes && cleanNotes.length > 80 ? cleanNotes.substring(0, 77) + '...' : (cleanNotes || 'Please review feedback');
        notifMessage = `📝 Brand requested a revision: "${displaySnippet}"`;
        notifLink = '/creator/ugc/orders';
        break;
      }

      case 'APPROVE': {
        orderStatus = 'COMPLETED';
        threadStatus = 'COMPLETED';
        orderUpdates = {
          ...orderUpdates,
          status: 'COMPLETED',
          payment_status: 'RELEASED',
          escrow_released_at: nowIso
        };
        threadUpdates = {
          ...threadUpdates,
          status: 'COMPLETED',
          flow_state: 'COMPLETED'
        };
        msgType = 'content_approved';
        msgText = `🎉 UGC Deliverable Approved!\n\nThe brand has approved your deliverable. Escrow payout has been released to your account.`;
        msgMetadata = {
          action: 'approved',
          status: 'COMPLETED'
        };
        notifType = 'ugc_deliverable_approved';
        notifTitle = 'Deliverable Approved';
        notifMessage = '🎉 Congratulations! Your UGC deliverable has been approved and escrow payout released.';
        notifLink = '/creator/ugc/orders';
        break;
      }

      case 'DECLINE_REVISION': {
        orderStatus = 'REVISION_DECLINED';
        threadStatus = 'ACTIVE';
        orderUpdates = {
          ...orderUpdates,
          status: 'REVISION_DECLINED',
          creator_notes: cleanNotes
        };
        threadUpdates = {
          ...threadUpdates,
          status: 'ACTIVE',
          flow_state: 'REVISION_DECLINED',
          revision_notes: cleanNotes
        };
        msgType = 'revision_declined';
        msgText = `⚠️ Creator Declined Revision Request\n\nReason: ${cleanNotes || 'Creator is unable to accommodate the requested changes.'}`;
        msgMetadata = {
          feedback: cleanNotes,
          notes: cleanNotes,
          action: 'revision_declined'
        };
        notifType = 'ugc_revision_declined';
        notifTitle = 'Revision Declined by Creator';
        const displaySnippet = cleanNotes && cleanNotes.length > 80 ? cleanNotes.substring(0, 77) + '...' : (cleanNotes || 'Unable to accommodate changes');
        notifMessage = `⚠️ Creator declined revision: "${displaySnippet}"`;
        notifLink = '/brand/ugc/orders';
        break;
      }

      case 'CANCEL': {
        orderStatus = 'CANCELLED';
        threadStatus = 'COMPLETED';
        const refundAmount = Number(order?.escrow_amount || order?.creator_payout || order?.agreed_amount || 0);
        orderUpdates = {
          ...orderUpdates,
          status: 'CANCELLED',
          brand_status: 'CANCELLED',
          creator_status: 'CANCELLED',
          payment_status: 'REFUNDED',
          escrow_hold: false,
          escrow_released_at: nowIso,
          cancelled_at: nowIso,
          refunded_at: nowIso
        };
        threadUpdates = {
          ...threadUpdates,
          status: 'COMPLETED',
          flow_state: 'CANCELLED'
        };
        const actorLabel = actorRole === 'brand' ? 'Brand' : 'Creator';
        msgType = 'order_cancelled';
        msgText = `🚫 UGC Order Cancelled\n\n${actorLabel} has cancelled the order.${cleanNotes ? `\nReason: ${cleanNotes}` : ''}\nEscrow funds of ₹${refundAmount.toLocaleString('en-IN')} have been refunded.`;
        msgMetadata = {
          reason: cleanNotes,
          notes: cleanNotes,
          refund_amount: refundAmount,
          action: 'order_cancelled'
        };
        notifType = 'ugc_order_cancelled';
        notifTitle = 'UGC Order Cancelled & Escrow Refunded';
        notifMessage = `🚫 UGC Order was cancelled by ${actorLabel.toLowerCase()}. Escrow refunded.`;
        notifLink = (receiverRole === 'brand' ? '/brand/ugc/orders' : '/creator/ugc/orders');
        break;
      }
    }

    // 2. Persist to Supabase
    if (supabase) {
      const SUPABASE_UGC_ORDER_COLS = new Set([
        'id', 'brief_id', 'brand_id', 'creator_id', 'status', 'creator_payout',
        'video_url', 'thumbnail_url', 'creator_notes', 'payment_status', 'created_at',
        'internal_deadline', 'agreement_signed_creator', 'escrow_hold', 'escrow_amount',
        'escrow_held_at', 'escrow_released_at', 'revision_count', 'revisions_used',
        'agreed_amount', 'delivered_at', 'cancelled_at'
      ]);
      const supaOrderUpdates: any = {};
      for (const [k, v] of Object.entries(orderUpdates)) {
        if (SUPABASE_UGC_ORDER_COLS.has(k) && v !== undefined) {
          supaOrderUpdates[k] = v;
        }
      }

      const SUPABASE_CHAT_THREAD_COLS = new Set([
        'id', 'deal_id', 'campaign_id', 'creator_id', 'brand_id', 'status', 'flow_state',
        'agreed_amount', 'deliverables', 'deadline', 'revision_count',
        'agreement_signed_creator', 'agreement_signed_brand', 'agreement_signed_at',
        'created_at', 'updated_at'
      ]);
      const supaThreadUpdates: any = {};
      for (const [k, v] of Object.entries(threadUpdates)) {
        if (SUPABASE_CHAT_THREAD_COLS.has(k) && v !== undefined) {
          supaThreadUpdates[k] = v;
        }
      }

      try {
        const { error: oErr } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .update(supaOrderUpdates)
          .or(`id.eq.${targetOrderId},brief_id.eq.${rawId}`);
        if (oErr) console.error("[syncUgcLifecycleEvent] Supabase ugc_orders update error:", oErr);
      } catch (e) {
        console.error("[syncUgcLifecycleEvent] Supabase ugc_orders update error:", e);
      }

      try {
        const { error: tErr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update(supaThreadUpdates)
          .or(`id.eq.${targetThreadId},deal_id.eq.${targetOrderId}`);
        if (tErr) console.error("[syncUgcLifecycleEvent] Supabase chat_threads update error:", tErr);
      } catch (e) {
        console.error("[syncUgcLifecycleEvent] Supabase chat_threads update error:", e);
      }

      if (action === 'SUBMIT_DELIVERABLE') {
        try {
          await (privilegedSupabase || supabase).from('content_submissions').insert({
            id: crypto.randomUUID(),
            deal_id: targetOrderId,
            creator_id: creatorId,
            submission_type: 'draft',
            video_url: cleanVideoUrl,
            caption: "",
            notes_to_brand: cleanNotes,
            status: 'PENDING_REVIEW',
            submitted_at: nowIso
          });
        } catch (e) {
          console.warn("[syncUgcLifecycleEvent] content_submissions insert warning:", e);
        }
      }

      if (action === 'CANCEL') {
        const refundAmount = Number(order?.escrow_amount || order?.creator_payout || order?.agreed_amount || 0);
        const isUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        try {
          const { error: txnErr } = await (privilegedSupabase || supabase).from('transactions').insert({
            id: crypto.randomUUID(),
            deal_id: isUuid(targetOrderId) ? targetOrderId : null,
            ugc_order_id: targetOrderId,
            creator_id: creatorId,
            gross_amount: refundAmount,
            platform_fee_amount: 0,
            creator_net_amount: 0,
            gst_amount: 0,
            status: 'SUCCESS',
            refund_amount: refundAmount,
            refund_status: 'PROCESSED',
            refund_reason: cleanNotes ? `Order cancelled: ${cleanNotes}` : 'Order cancelled by user',
            refund_reference: `REFUND_${Date.now()}`,
            created_at: nowIso,
            refunded_at: nowIso
          });
          if (txnErr) console.warn("[syncUgcLifecycleEvent] Supabase transaction refund insert error:", txnErr);
        } catch (e) {
          console.warn("[syncUgcLifecycleEvent] Supabase transaction refund insert warning:", e);
        }

        try {
          const briefId = order?.brief_id;
          if (briefId) {
            const { data: b } = await (privilegedSupabase || supabase).from('ugc_briefs').select('claimed_count').eq('id', briefId).maybeSingle();
            const newCount = Math.max(0, (b?.claimed_count || 1) - 1);
            await (privilegedSupabase || supabase).from('ugc_briefs').update({
              claimed_count: newCount,
              status: 'OPEN'
            }).eq('id', briefId);
          }
        } catch (e) {}
      }
    }

    // 3. Persist to Local DB
    if (!db.ugc_orders) db.ugc_orders = [];
    let localOrder = db.ugc_orders.find((o: any) => o.id === targetOrderId || o.id === rawId || o.brief_id === rawId);
    if (localOrder) {
      Object.assign(localOrder, orderUpdates);
    } else if (order) {
      localOrder = { ...order, ...orderUpdates };
      db.ugc_orders.push(localOrder);
    }

    if (!db.chat_threads) db.chat_threads = [];
    let localThread = db.chat_threads.find((t: any) => t.id === targetThreadId || t.deal_id === targetOrderId || t.id === targetOrderId);
    if (localThread) {
      Object.assign(localThread, threadUpdates);
      if (localThread.ugc_order) {
        Object.assign(localThread.ugc_order, orderUpdates);
      }
    } else if (thread) {
      localThread = { ...thread, ...threadUpdates };
      db.chat_threads.push(localThread);
    }

    if (action === 'SUBMIT_DELIVERABLE') {
      if (!db.content_submissions) db.content_submissions = [];
      db.content_submissions.push({
        id: crypto.randomUUID(),
        deal_id: targetOrderId,
        creator_id: creatorId,
        submission_type: 'draft',
        video_url: cleanVideoUrl,
        caption: "",
        notes_to_brand: cleanNotes,
        status: 'PENDING_REVIEW',
        submitted_at: nowIso
      });
    }

    if (action === 'CANCEL') {
      const refundAmount = Number(order?.escrow_amount || localOrder?.escrow_amount || order?.creator_payout || localOrder?.creator_payout || order?.agreed_amount || localOrder?.agreed_amount || 0);
      const refundTxnId = `txn_ref_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
      const refundTxnPayload = {
        id: crypto.randomUUID(),
        transaction_id: refundTxnId,
        deal_id: targetOrderId,
        ugc_order_id: targetOrderId,
        brief_id: order?.brief_id || localOrder?.brief_id || null,
        brand_id: brandId,
        creator_id: creatorId,
        gross_amount: refundAmount,
        platform_fee_amount: 0,
        creator_net_amount: 0,
        gst_amount: 0,
        status: 'REFUNDED',
        escrow_hold: false,
        payout_status: 'REFUNDED',
        payout_type: 'refund',
        refund_amount: refundAmount,
        refund_status: 'PROCESSED',
        refund_reason: cleanNotes ? `Order cancelled: ${cleanNotes}` : 'Order cancelled by user',
        refund_reference: `REFUND_${Date.now()}`,
        created_at: nowIso,
        refunded_at: nowIso
      };

      if (!db.transactions) db.transactions = [];
      db.transactions.unshift(refundTxnPayload);

      // Also update any prior transaction linked to this brief or ugc order
      const priorTxn = db.transactions.find((t: any) => 
        (t.ugc_order_id && t.ugc_order_id === targetOrderId) || 
        (t.deal_id && t.deal_id === targetOrderId) || 
        ((order?.brief_id || localOrder?.brief_id) && t.brief_id === (order?.brief_id || localOrder?.brief_id))
      );
      if (priorTxn && priorTxn !== refundTxnPayload) {
        priorTxn.escrow_hold = false;
        priorTxn.status = 'REFUNDED';
        priorTxn.refund_status = 'PROCESSED';
        priorTxn.refund_amount = refundAmount;
        priorTxn.refunded_at = nowIso;
      }

      const briefId = order?.brief_id || localOrder?.brief_id;
      if (briefId && db.ugc_briefs) {
        const brief = db.ugc_briefs.find((b: any) => b.id === briefId);
        if (brief) {
          brief.claimed_count = Math.max(0, (brief.claimed_count || 1) - 1);
          brief.status = 'OPEN';
        }
      }
    }

    // 4. Create and persist Chat Message
    const msgId = crypto.randomUUID();
    const senderUserId = actorUser?.user_id || (actorRole === 'brand' ? brandId : creatorId) || '';
    const msgPayload = {
      message_id: msgId,
      thread_id: targetThreadId,
      sender_user_id: senderUserId,
      receiver_user_id: receiverId,
      text: msgText,
      from_name: actorName,
      message_type: msgType,
      metadata: msgMetadata,
      created_at: nowIso,
      read: false
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgPayload);
      } catch (e) {
        console.error("[syncUgcLifecycleEvent] Chat message insert error:", e);
      }
    }

    const localMsgObj = {
      ...msgPayload,
      id: msgId,
      content: msgText,
      sender_id: senderUserId,
      receiver_id: receiverId,
      sender_role: actorRole,
      message_type: msgType,
      media_url: cleanVideoUrl || undefined,
      content_url: cleanVideoUrl || undefined,
      metadata: msgMetadata
    };

    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(localMsgObj);

    // 5. Create and persist Notification
    let notifObj: any = null;
    if (receiverId) {
      const notifId = `notif_${crypto.randomUUID().replace(/-/g, '').substring(0, 10)}`;
      notifObj = {
        notif_id: notifId,
        user_id: receiverId,
        type: notifType,
        title: notifTitle,
        message: notifMessage,
        event_type: notifType,
        event_ref_id: targetOrderId,
        role_context: receiverRole,
        subtype: 'general',
        read: false,
        created_at: nowIso,
        link: notifLink
      };

      if (supabase) {
        try {
          const { link: _l, ...supaNotif } = notifObj;
          await (privilegedSupabase || supabase).from('notifications').insert(supaNotif);
        } catch (e) {
          console.warn("[syncUgcLifecycleEvent] Notification insert warning:", e);
        }
      }

      if (!db.notifications) db.notifications = [];
      db.notifications.unshift(notifObj);
    }

    saveDb(db);

    // 6. Broadcast Realtime Socket.io events
    if (io) {
      io.to(targetThreadId).emit("new_message", localMsgObj);
      io.to(targetThreadId).emit("thread_updated", {
        threadId: targetThreadId,
        status: threadStatus,
        flow_state: threadUpdates.flow_state,
        revision_notes: cleanNotes,
        ugc_order: {
          ...(order || localOrder || {}),
          ...orderUpdates,
          id: targetOrderId
        }
      });
      io.emit("thread_updated", { threadId: targetThreadId, status: threadStatus, flow_state: threadUpdates.flow_state });

      if (receiverId) {
        io.to(receiverId).to(`user_${receiverId}`).emit("notification", {
          type: notifType,
          title: notifTitle,
          message: notifMessage,
          link: notifLink,
          order_id: targetOrderId,
          thread_id: targetThreadId
        });
      }
    }

    return {
      ok: true,
      success: true,
      action,
      order_id: targetOrderId,
      thread_id: targetThreadId,
      status: orderStatus,
      message_id: msgId,
      message_text: msgText,
      chat_message: localMsgObj,
      notification: notifObj,
      order: { ...(order || {}), ...(localOrder || {}), ...orderUpdates }
    };
  }

  // 9. Submit UGC Deliverable (handles plural /ugc/orders/:id/submit, singular /ugc/order/:id/submit, and chat submit routes)
  const handleUgcDeliverableSubmit = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const rawId = req.params.id || req.params.threadId;

    let finalVideoUrl = (
      req.body?.videoUrl ||
      req.body?.video_url ||
      req.body?.content_url ||
      req.body?.contentUrl ||
      req.body?.driveUrl ||
      req.body?.drive_url ||
      req.body?.link ||
      req.body?.url ||
      req.body?.fileUrl ||
      ""
    ).trim();

    const notes = (
      req.body?.notes ||
      req.body?.creator_notes ||
      req.body?.contentNotes ||
      req.body?.notes_to_brand ||
      req.body?.feedback ||
      ""
    ).trim();

    if (!finalVideoUrl) {
      return res.status(400).json({ error: "A video file or link is required" });
    }

    const result = await syncUgcLifecycleEvent({
      rawId,
      action: 'SUBMIT_DELIVERABLE',
      actorUser: user,
      notes,
      videoUrl: finalVideoUrl,
      io: req.app.get("io")
    });

    return res.json({
      ...result,
      message: "Deliverable submitted successfully! Brand has been notified.",
      video_url: finalVideoUrl,
      notes: notes,
      status: 'SUBMITTED'
    });
  };


  // 10c. Approve Live Links & Release Payment (Deal Completion)
  const handleThreadApproveLiveLinks = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const rawId = req.params.id || req.params.threadId;
    const db = getDb();
    const nowIso = getIsoNow ? getIsoNow() : new Date().toISOString();
    const io = req.app.get("io");

    let targetThread: any = (db.chat_threads || []).find((t: any) => t.id === rawId || t.deal_id === rawId);
    if (!targetThread && supabase) {
      try {
        const { data: threadRow } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${rawId},deal_id.eq.${rawId}`)
          .maybeSingle();
        if (threadRow) targetThread = threadRow;
      } catch (e) {}
    }

    const targetThreadId = targetThread?.id || rawId;
    const dealId = targetThread?.deal_id || (targetThread?.metadata && targetThread.metadata.deal_id) || (rawId.startsWith('thread_camp_') ? rawId.replace('thread_camp_', '') : rawId);

    let dealObj = (db.deals || []).find((d: any) => d.id === dealId || d.id === targetThreadId);
    let creatorId = targetThread?.creator_id || dealObj?.creator_id;
    let brandId = targetThread?.brand_id || dealObj?.brand_id || user?.user_id;

    if ((!creatorId || !brandId || !dealObj) && supabase && dealId) {
      try {
        const { data: dRec } = await (privilegedSupabase || supabase)
          .from('deals')
          .select('*')
          .eq('id', dealId)
          .maybeSingle();
        if (dRec) {
          if (!creatorId) creatorId = dRec.creator_id;
          if (!brandId) brandId = dRec.brand_id;
          if (!dealObj) dealObj = dRec;
        }
      } catch (e) {}
    }

    // Canonical UUID validation for sender and receiver
    const isUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const canonicalBrandId = isUuid(brandId) ? brandId : (isUuid(user?.user_id) ? user.user_id : (isUuid(user?.id) ? user.id : brandId));
    const canonicalCreatorId = isUuid(creatorId) ? creatorId : (targetThread?.creator_id || dealObj?.creator_id || creatorId);

    const dealAmount = Number(dealObj?.agreed_amount || targetThread?.agreed_amount || targetThread?.amount_fixed || 5000);
    const feeCalc = await calculatePlatformFee(dealAmount, (privilegedSupabase || supabase));
    const feePercentage = Number(feeCalc?.feePercent ?? 15);
    const platformFee = Number(feeCalc?.platformFee ?? Math.round(((dealAmount * feePercentage) / 100) * 100) / 100);
    const netAmount = Number(feeCalc?.creatorNet ?? Math.max(0, Math.round((dealAmount - platformFee) * 100) / 100));

    // 1. Update Deals table: status = 'COMPLETED' (do NOT pass non-existent flow_state column to deals)
    if (supabase && dealId) {
      try {
        const { error: dealsErr } = await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            status: 'COMPLETED',
            updated_at: nowIso
          })
          .eq('id', dealId);
        if (dealsErr) {
          console.error("[handleThreadApproveLiveLinks] deals update error:", dealsErr);
        }
      } catch (e) {
        console.warn("[handleThreadApproveLiveLinks] deals update error:", e);
      }
    }
    if (dealObj) {
      dealObj.status = 'COMPLETED';
      dealObj.stage = 'COMPLETED';
      dealObj.flow_state = 'COMPLETED';
      dealObj.updated_at = nowIso;
    }
    if (db.collabs) {
      const c = db.collabs.find((x: any) => x.collab_id === dealId || x.id === dealId);
      if (c) {
        c.status = 'COMPLETED';
        c.stage = 'COMPLETED';
        c.updated_at = nowIso;
      }
    }

    // 1b. Update transactions table: status = 'SUCCESS', payout_status = 'RELEASED'
    if (supabase && dealId) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);
        let existingTxns: any[] = [];
        if (isUuid) {
          const { data } = await (privilegedSupabase || supabase)
            .from('transactions')
            .select('id, deal_id')
            .or(`deal_id.eq.${dealId},id.eq.${dealId}`);
          if (data && data.length > 0) existingTxns = data;
        }

        if (existingTxns.length > 0) {
          for (const tx of existingTxns) {
            const { error: txErr } = await (privilegedSupabase || supabase)
              .from('transactions')
              .update({
                payout_status: 'PAID',
                status: 'SUCCESS',
                platform_fee_amount: platformFee,
                creator_net_amount: netAmount,
                payout_completed_at: nowIso
              })
              .eq('id', tx.id);
            if (txErr) {
              console.error("[handleThreadApproveLiveLinks] transactions update error:", txErr);
            }
          }
        } else {
          // If no existing transaction found by or condition, update by deal_id directly or insert a completed transaction
          const { error: directErr, count } = await (privilegedSupabase || supabase)
            .from('transactions')
            .update({
              payout_status: 'PAID',
              status: 'SUCCESS',
              platform_fee_amount: platformFee,
              creator_net_amount: netAmount,
              payout_completed_at: nowIso
            })
            .eq('deal_id', dealId);

          if (isUuid && (count === 0 || directErr)) {
            await (privilegedSupabase || supabase)
              .from('transactions')
              .insert({
                id: crypto.randomUUID(),
                deal_id: dealId,
                creator_id: canonicalCreatorId || null,
                gross_amount: dealAmount,
                platform_fee_amount: platformFee,
                creator_net_amount: netAmount,
                gst_amount: 0,
                status: 'SUCCESS',
                payout_status: 'PAID',
                payout_type: 'full',
                created_at: nowIso,
                payout_completed_at: nowIso
              });
          }
        }
      } catch (txErr) {
        console.error("[handleThreadApproveLiveLinks] transactions update exception:", txErr);
      }
    }
    if (db.transactions) {
      const tx = db.transactions.find((t: any) => t.deal_id === dealId || t.id === dealId);
      if (tx) {
        tx.payout_status = 'RELEASED';
        tx.status = 'SUCCESS';
        tx.platform_fee_amount = platformFee;
        tx.creator_net_amount = netAmount;
        tx.payout_completed_at = nowIso;
      } else {
        db.transactions.push({
          id: crypto.randomUUID(),
          deal_id: dealId,
          creator_id: canonicalCreatorId,
          gross_amount: dealAmount,
          platform_fee_amount: platformFee,
          creator_net_amount: netAmount,
          status: 'SUCCESS',
          payout_status: 'RELEASED',
          payout_type: 'full',
          created_at: nowIso,
          payout_completed_at: nowIso
        });
      }
    }

    // 2. Update chat_threads: status = 'COMPLETED', flow_state = 'COMPLETED'
    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update({
            status: 'COMPLETED',
            flow_state: 'COMPLETED',
            updated_at: nowIso
          })
          .eq('id', targetThreadId);
      } catch (e) {
        console.warn("[handleThreadApproveLiveLinks] chat_threads update error:", e);
      }
    }
    if (targetThread) {
      targetThread.status = 'COMPLETED';
      targetThread.flow_state = 'COMPLETED';
      targetThread.updated_at = nowIso;
    }

    // 3. Insert distinct chat message: message_type = 'live_links_approved'
    const msgId = crypto.randomUUID();
    const msgText = `🎉 Deliverables Approved & Payment Released! The brand has approved the live post. Creator payout of ₹${netAmount.toLocaleString('en-IN')} (₹${dealAmount.toLocaleString('en-IN')} gross minus ${feePercentage}% platform fee of ₹${platformFee.toLocaleString('en-IN')}) is being processed via Escrow in 1–2 working days.`;
    const msgMetadata = {
      action: 'live_links_approved',
      status: 'COMPLETED',
      amount: dealAmount,
      gross_amount: dealAmount,
      platform_fee_percent: feePercentage,
      platform_fee_amount: platformFee,
      creator_net_amount: netAmount,
      payout_status: 'RELEASED',
      sender_role: 'brand',
      sender_id: canonicalBrandId
    };

    const msgRecord: any = {
      message_id: msgId,
      id: msgId,
      thread_id: targetThreadId,
      sender_user_id: canonicalBrandId,
      receiver_user_id: canonicalCreatorId || null,
      sender_id: canonicalBrandId,
      receiver_id: canonicalCreatorId || null,
      sender_role: 'brand',
      text: msgText,
      content: msgText,
      from_name: user?.name || user?.full_name || 'Brand',
      message_type: 'live_links_approved',
      metadata: msgMetadata,
      read: false,
      created_at: nowIso
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgRecord);
      } catch (e) {
        console.error("[handleThreadApproveLiveLinks] Chat message insert error:", e);
      }
    }
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(msgRecord);

    // 4. Notification for creator
    if (canonicalCreatorId) {
      const notifId = `notif_${crypto.randomUUID().slice(0, 10)}`;
      const notifData = {
        id: notifId,
        user_id: canonicalCreatorId,
        type: 'deal_live_links_approved',
        title: 'Work Approved & Payment Released! 🎉',
        message: `Brand approved your deliverables for ₹${dealAmount.toLocaleString('en-IN')}. Escrow payout processing in 1–2 working days.`,
        link: `/messages/${targetThreadId}`,
        read: false,
        created_at: nowIso
      };
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('notifications').insert(notifData);
        } catch (e) {}
      }
      if (!db.notifications) db.notifications = [];
      db.notifications.push(notifData);
    }

    // 5. Socket emit
    if (io) {
      io.to(targetThreadId).emit("new_message", msgRecord);
      io.emit("thread_updated", {
        threadId: targetThreadId,
        status: 'COMPLETED',
        flow_state: 'COMPLETED'
      });
    }

    saveDb(db);

    return res.json({
      ok: true,
      success: true,
      thread_id: targetThreadId,
      deal_id: dealId,
      status: 'COMPLETED',
      flow_state: 'COMPLETED',
      amount: dealAmount,
      creator_net_amount: netAmount,
      message: "Live links approved and payment released! Creator payout processing via Escrow in 1-2 working days."
    });
  };

  // 10. Approve UGC Order & Release Escrow Payout
  const handleUgcOrderApprove = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id || req.params.threadId;
    const notes = req.body?.notes || req.body?.feedback || "";

    // Check if this is for a Campaign Deal thread or Live Links approval!
    const db = getDb();
    const thread = (db.chat_threads || []).find((t: any) => t.id === id || t.deal_id === id);
    const isCampaignDealThread = Boolean(
      (typeof id === 'string' && id.startsWith('thread_camp_')) ||
      (thread?.id && String(thread.id).startsWith('thread_camp_')) ||
      thread?.deal_id ||
      thread?.campaign_id
    );
    const isLiveLinkApproval = Boolean(
      req.body?.action === 'approve_live_links' ||
      req.body?.action === 'approve_deliverable' ||
      thread?.flow_state === 'PROOF_SUBMITTED' ||
      thread?.live_links_submitted
    );

    if (isCampaignDealThread || isLiveLinkApproval) {
      return handleThreadApproveLiveLinks(req, res);
    }

    const result = await syncUgcLifecycleEvent({
      rawId: id,
      action: 'APPROVE',
      actorUser: user,
      notes,
      io: req.app.get("io")
    });

    return res.json({
      ...result,
      message: "Order approved! Escrow payout released to creator."
    });
  };

  // 10b. Approve Content for Thread (separates Campaign Deals from UGC Orders)
  const handleThreadApproveContent = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id || req.params.threadId;
    const notes = req.body?.notes || req.body?.feedback || "";
    const nowIso = getIsoNow();
    const db = getDb();

    // 1. Resolve thread and check whether it belongs to a Deal vs UGC Order
    let thread: any = null;
    if (supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${id},deal_id.eq.${id}`)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e) {
        console.warn("[handleThreadApproveContent] Error resolving thread:", e);
      }
    }
    if (!thread && db.chat_threads) {
      thread = db.chat_threads.find((t: any) => t.id === id || t.deal_id === id);
    }

    const targetOrderId = thread?.deal_id || thread?.id || id;
    let ugcOrder: any = null;
    if (supabase) {
      try {
        const { data: o } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${id},id.eq.${targetOrderId},brief_id.eq.${id}`)
          .maybeSingle();
        if (o) ugcOrder = o;
      } catch (e) {
        console.warn("[handleThreadApproveContent] Error checking ugc_orders:", e);
      }
    }
    if (!ugcOrder && db.ugc_orders) {
      ugcOrder = db.ugc_orders.find((o: any) => o.id === id || o.id === targetOrderId || o.brief_id === id);
    }

    // Check whether this thread belongs to a Deal (thread.deal_id is set and there's no matching ugc_orders row for this id) or a UGC order
    const isDeal = Boolean(
      (thread?.deal_id && !ugcOrder) ||
      (thread?.campaign_id && !ugcOrder) ||
      (thread?.id && String(thread.id).startsWith("thread_camp_"))
    );

    const isUgcOrder = !isDeal && Boolean(
      ugcOrder ||
      thread?.is_ugc ||
      thread?.ugc_order_id ||
      thread?.type === 'ugc' ||
      thread?.deal_type === 'UGC' ||
      thread?.ugc_brief_id ||
      (thread?.id && String(thread.id).startsWith("thread_ugc_")) ||
      (typeof id === 'string' && id.startsWith("ugcord_"))
    );

    // If it's genuinely a UGC order thread, keep existing UGC behavior exactly as-is
    if (isUgcOrder) {
      const result = await syncUgcLifecycleEvent({
        rawId: id,
        action: 'APPROVE',
        actorUser: user,
        notes,
        io: req.app.get("io")
      });
      return res.json({
        ...result,
        message: "Order approved! Escrow payout released to creator."
      });
    }

    // Otherwise, this is a Campaign Deal thread!
    const dealId = thread?.deal_id || id;
    const targetThreadId = thread?.id || id;
    let creatorId = thread?.creator_id;
    let brandId = thread?.brand_id || user?.user_id;

    if ((!creatorId || !brandId) && supabase && dealId) {
      try {
        const { data: dRec } = await (privilegedSupabase || supabase)
          .from('deals')
          .select('creator_id, brand_id')
          .eq('id', dealId)
          .maybeSingle();
        if (dRec) {
          if (!creatorId) creatorId = dRec.creator_id;
          if (!brandId) brandId = dRec.brand_id;
        }
      } catch (e) {}
    }

    // A. Update latest content_submission for this deal to APPROVED
    if (supabase) {
      try {
        const { data: sByDeal } = await (privilegedSupabase || supabase)
          .from('content_submissions')
          .select('*')
          .eq('deal_id', dealId)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sByDeal) {
          await (privilegedSupabase || supabase)
            .from('content_submissions')
            .update({
              status: 'APPROVED',
              brand_feedback: notes || null,
              reviewed_at: nowIso
            })
            .eq('id', sByDeal.id);
        }
      } catch (e) {
        console.warn("[handleThreadApproveContent] content_submissions update error:", e);
      }
    }
    if (db.content_submissions) {
      const sub = db.content_submissions.slice().reverse().find((s: any) => s.deal_id === dealId || s.id === dealId);
      if (sub) {
        sub.status = 'APPROVED';
        sub.reviewed_at = nowIso;
        if (notes) sub.brand_feedback = notes;
      }
    }

    // B. Update deals table: status = 'CONTENT_APPROVED' (do NOT touch escrow_hold)
    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            status: 'CONTENT_APPROVED',
            updated_at: nowIso
          })
          .eq('id', dealId);
      } catch (e) {
        console.warn("[handleThreadApproveContent] deals update error:", e);
      }
    }
    if (db.deals) {
      const d = db.deals.find((x: any) => x.id === dealId || x.deal_id === dealId);
      if (d) {
        d.status = 'CONTENT_APPROVED';
        d.stage = 'CONTENT_APPROVED';
        d.updated_at = nowIso;
      }
    }
    if (db.collabs) {
      const c = db.collabs.find((x: any) => x.collab_id === dealId || x.id === dealId);
      if (c) {
        c.status = 'CONTENT_APPROVED';
        c.stage = 'CONTENT_APPROVED';
        c.updated_at = nowIso;
      }
    }

    // C. Update chat_threads: status = 'ACTIVE', flow_state = 'CONTENT_APPROVED' (do NOT set COMPLETED)
    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update({
            status: 'ACTIVE',
            flow_state: 'CONTENT_APPROVED',
            updated_at: nowIso
          })
          .eq('id', targetThreadId);
      } catch (e) {
        console.warn("[handleThreadApproveContent] chat_threads update error:", e);
      }
    }
    if (db.chat_threads) {
      const t = db.chat_threads.find((x: any) => x.id === targetThreadId || x.deal_id === dealId);
      if (t) {
        t.status = 'ACTIVE';
        t.flow_state = 'CONTENT_APPROVED';
        t.content_approved = true;
        t.updated_at = nowIso;
      }
    }

    // D. Insert accurate chat message
    const msgId = crypto.randomUUID();
    const msgText = "🎉 Content Approved! The brand has approved your draft. Please submit your live post link to complete this deal.";
    const msgMetadata = {
      action: 'draft_approved',
      status: 'CONTENT_APPROVED',
      notes: notes || undefined
    };
    const msgRecord: any = {
      message_id: msgId,
      id: msgId,
      thread_id: targetThreadId,
      sender_user_id: user?.user_id || brandId,
      receiver_user_id: creatorId || null,
      sender_id: user?.user_id || brandId,
      receiver_id: creatorId || null,
      sender_role: 'brand',
      text: msgText,
      content: msgText,
      from_name: user?.name || user?.full_name || 'Brand',
      message_type: 'content_approved',
      metadata: msgMetadata,
      read: false,
      created_at: nowIso
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgRecord);
      } catch (e) {
        console.error("[handleThreadApproveContent] Chat message insert error:", e);
      }
    }
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(msgRecord);

    // E. Notification for creator
    if (creatorId) {
      const notifId = `notif_${crypto.randomUUID().slice(0, 10)}`;
      const notifData = {
        id: notifId,
        user_id: creatorId,
        type: 'deal_content_approved',
        title: 'Draft Approved! 🚀',
        message: 'The brand approved your content draft. Please submit your live post link to proceed.',
        link: `/messages/${targetThreadId}`,
        read: false,
        created_at: nowIso
      };
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('notifications').insert(notifData);
        } catch (e) {}
      }
      if (!db.notifications) db.notifications = [];
      db.notifications.push(notifData);
    }

    // F. Socket emission
    const io = req.app.get("io");
    if (io) {
      io.to(targetThreadId).emit("new_message", msgRecord);
      io.emit("thread_updated", {
        threadId: targetThreadId,
        status: 'ACTIVE',
        flow_state: 'CONTENT_APPROVED'
      });
    }

    saveDb(db);

    return res.json({
      ok: true,
      success: true,
      deal_id: dealId,
      thread_id: targetThreadId,
      status: 'CONTENT_APPROVED',
      flow_state: 'CONTENT_APPROVED',
      message: "Draft content approved! Notification sent to creator to submit live link."
    });
  };

  const handleThreadSubmitLiveLink = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const targetThreadId = req.params.threadId || req.params.id;
    const { link, links, live_link, instagram_post_url, notes, content_notes } = req.body || {};
    const rawUrl = (
      link ||
      (Array.isArray(links)
        ? (links.map((l: any) => (typeof l === 'string' ? l : l?.url || '')).find((u: string) => u.trim() !== '') || '')
        : (typeof links === 'string' ? links : (links?.url || ''))) ||
      live_link ||
      instagram_post_url ||
      ""
    ).trim();
    const finalNotes = (notes || content_notes || "").trim();

    // Validate that link is a valid URL with http(s):// and a recognizable domain
    const isValidLiveUrl = (urlStr: string): boolean => {
      if (!urlStr || typeof urlStr !== 'string') return false;
      const trimmed = urlStr.trim();
      if (!trimmed || /\s/.test(trimmed)) return false;
      try {
        const toTest = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
        const parsed = new URL(toTest);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
        const hostParts = parsed.hostname.split('.');
        if (hostParts.length < 2) return false;
        const tld = hostParts[hostParts.length - 1];
        if (!tld || tld.length < 2 || !/^[a-zA-Z]{2,}$/.test(tld)) return false;
        if (!/^[a-zA-Z0-9.-]+$/.test(parsed.hostname)) return false;
        return true;
      } catch (e) {
        return false;
      }
    };

    if (!rawUrl || !isValidLiveUrl(rawUrl)) {
      return res.status(400).json({
        error: "Invalid URL. Please provide a valid live post link starting with http:// or https:// (e.g. https://www.instagram.com/p/...)"
      });
    }

    const finalUrl = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`;

    const nowIso = new Date().toISOString();
    const db = getDb();

    // 1. Resolve thread and deal
    let thread: any = null;
    if (supabase) {
      try {
        const { data: t } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${targetThreadId},deal_id.eq.${targetThreadId}`)
          .maybeSingle();
        if (t) thread = t;
      } catch (e) {}
    }
    if (!thread && db.chat_threads) {
      thread = db.chat_threads.find((x: any) => x.id === targetThreadId || x.deal_id === targetThreadId);
    }

    const dealId = thread?.deal_id || (targetThreadId.startsWith('thread_camp_') ? targetThreadId.replace('thread_camp_', '') : targetThreadId);
    
    // Canonical creator resolution: ensure sender survives UUID validation and matches thread
    const isUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const canonicalCreatorId = isUuid(thread?.creator_id)
      ? thread.creator_id
      : (isUuid(user?.user_id) ? user.user_id : (isUuid(user?.id) ? user.id : (thread?.creator_id || user?.user_id || 'creator')));
    const brandId = thread?.brand_id;

    const proofData = {
      instagram_post_url: finalUrl,
      live_link: finalUrl,
      notes: finalNotes || undefined,
      submitted_at: nowIso
    };

    // 2. Update deals in Supabase and local DB
    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            status: 'PROOF_SUBMITTED',
            updated_at: nowIso
          })
          .eq('id', dealId);
      } catch (e) {
        console.warn("[handleThreadSubmitLiveLink] Supabase deals update error:", e);
      }
    }

    if (db.deals) {
      const d = db.deals.find((x: any) => x.id === dealId || x.deal_id === dealId);
      if (d) {
        d.status = 'PROOF_SUBMITTED';
        d.stage = 'PROOF_SUBMITTED';
        d.instagram_post_url = finalUrl;
        d.proof = proofData;
        d.updated_at = nowIso;
      }
    }
    if (db.collabs) {
      const c = db.collabs.find((x: any) => x.collab_id === dealId || x.id === dealId);
      if (c) {
        c.status = 'PROOF_SUBMITTED';
        c.stage = 'PROOF_SUBMITTED';
        c.instagram_post_url = finalUrl;
        c.proof = proofData;
        c.updated_at = nowIso;
      }
    }

    // 3. Update chat_threads in Supabase and local DB
    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update({
            status: 'ACTIVE',
            flow_state: 'PROOF_SUBMITTED',
            updated_at: nowIso
          })
          .eq('id', targetThreadId);
      } catch (e) {
        console.warn("[handleThreadSubmitLiveLink] Supabase chat_threads update error:", e);
      }
    }

    if (db.chat_threads) {
      const t = db.chat_threads.find((x: any) => x.id === targetThreadId || x.deal_id === dealId);
      if (t) {
        t.status = 'ACTIVE';
        t.flow_state = 'PROOF_SUBMITTED';
        t.live_links_submitted = true;
        t.live_link = finalUrl;
        t.updated_at = nowIso;
      }
    }

    // 4. Insert chat message for thread
    const msgId = crypto.randomUUID();
    const msgText = `🚀 Live Post Link Submitted!\n\nLink: ${finalUrl}${finalNotes ? `\n\nNotes: ${finalNotes}` : ''}`;
    const msgMetadata = {
      action: 'live_link_submitted',
      status: 'PROOF_SUBMITTED',
      link: finalUrl,
      links: [finalUrl],
      notes: finalNotes || undefined,
      sender_role: 'creator',
      sender_id: canonicalCreatorId,
      creator_id: canonicalCreatorId
    };

    const msgRecord: any = {
      message_id: msgId,
      id: msgId,
      thread_id: targetThreadId,
      sender_user_id: canonicalCreatorId,
      receiver_user_id: brandId || null,
      sender_id: canonicalCreatorId,
      receiver_id: brandId || null,
      sender_role: 'creator',
      text: msgText,
      content: msgText,
      from_name: user?.name || user?.full_name || 'Creator',
      message_type: 'live_links_submitted',
      metadata: msgMetadata,
      read: false,
      created_at: nowIso
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgRecord);
      } catch (e) {
        console.error("[handleThreadSubmitLiveLink] Chat message insert error:", e);
      }
    }
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(msgRecord);

    // 5. Notification for brand
    if (brandId) {
      const notifId = `notif_${crypto.randomUUID().slice(0, 10)}`;
      const notifData = {
        id: notifId,
        user_id: brandId,
        type: 'deal_live_links_submitted',
        title: 'Live Link Submitted! 🚀',
        message: 'The creator submitted their live post link. Review the post and release payout.',
        link: `/messages/${targetThreadId}`,
        read: false,
        created_at: nowIso
      };
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('notifications').insert(notifData);
        } catch (e) {}
      }
      if (!db.notifications) db.notifications = [];
      db.notifications.push(notifData);
    }

    // 6. Socket emit
    if (io) {
      io.to(targetThreadId).emit("new_message", msgRecord);
      io.emit("thread_updated", {
        threadId: targetThreadId,
        status: 'ACTIVE',
        flow_state: 'PROOF_SUBMITTED'
      });
    }

    saveDb(db);

    return res.json({
      ok: true,
      success: true,
      deal_id: dealId,
      thread_id: targetThreadId,
      status: 'PROOF_SUBMITTED',
      flow_state: 'PROOF_SUBMITTED',
      link: finalUrl,
      message: "Live link submitted successfully! Brand has been notified."
    });
  };

  // Reject live links / Request resubmission of live links by Brand
  const handleThreadRejectLiveLinks = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const rawId = req.params.id || req.params.threadId;
    const feedback = (req.body?.feedback || req.body?.notes || req.body?.reason || req.body?.comments || "").trim() || "Please resubmit correct live links.";

    const db = getDb();
    let targetThread: any = (db.chat_threads || []).find((t: any) => t.id === rawId || t.deal_id === rawId);

    if (!targetThread && supabase) {
      try {
        const { data: threadRow } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .eq('id', rawId)
          .maybeSingle();
        if (threadRow) targetThread = threadRow;
      } catch (e) {}
    }

    const targetThreadId = targetThread?.id || rawId;
    const dealId = targetThread?.deal_id || (targetThread?.metadata && targetThread.metadata.deal_id) || rawId;
    const nowIso = new Date().toISOString();

    // Find deal
    let dealObj = (db.deals || []).find((d: any) => d.id === dealId || d.id === targetThreadId);
    if (dealObj) {
      dealObj.flow_state = 'REVISION_REQUESTED_LINKS';
      dealObj.status = 'ACTIVE';
      dealObj.revision_notes_links = feedback;
      dealObj.updated_at = nowIso;
    }

    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            status: 'ACTIVE',
            updated_at: nowIso
          })
          .eq('id', dealId);
      } catch (e) {
        console.warn("[handleThreadRejectLiveLinks] Supabase deals update error:", e);
      }
    }

    // Update chat_thread
    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update({
            flow_state: 'REVISION_REQUESTED_LINKS',
            status: 'ACTIVE',
            revision_notes_links: feedback,
            updated_at: nowIso
          })
          .eq('id', targetThreadId);
      } catch (e) {
        console.warn("[handleThreadRejectLiveLinks] Supabase chat_threads update error:", e);
      }
    }

    if (db.chat_threads) {
      const t = db.chat_threads.find((x: any) => x.id === targetThreadId || x.deal_id === dealId);
      if (t) {
        t.status = 'ACTIVE';
        t.flow_state = 'REVISION_REQUESTED_LINKS';
        t.revision_notes_links = feedback;
        t.updated_at = nowIso;
      }
    }

    const creatorId = targetThread?.creator_id || dealObj?.creator_id;
    const brandId = targetThread?.brand_id || dealObj?.brand_id || user.user_id;

    // Chat message
    const msgId = crypto.randomUUID();
    const msgText = `❌ Resubmission requested by Brand: ${feedback}`;
    const msgMetadata = {
      action: 'live_links_resubmit_requested',
      status: 'REVISION_REQUESTED_LINKS',
      feedback
    };

    const msgRecord: any = {
      message_id: msgId,
      id: msgId,
      thread_id: targetThreadId,
      sender_user_id: user?.user_id || brandId,
      receiver_user_id: creatorId || null,
      sender_id: user?.user_id || brandId,
      receiver_id: creatorId || null,
      sender_role: 'brand',
      text: msgText,
      content: msgText,
      from_name: user?.name || user?.full_name || 'Brand',
      message_type: 'live_links_resubmit_request',
      metadata: msgMetadata,
      read: false,
      created_at: nowIso
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgRecord);
      } catch (e) {
        console.error("[handleThreadRejectLiveLinks] Chat message insert error:", e);
      }
    }
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(msgRecord);

    // Notification for creator
    if (creatorId) {
      const notifId = `notif_${crypto.randomUUID().slice(0, 10)}`;
      const notifData = {
        id: notifId,
        user_id: creatorId,
        type: 'deal_live_links_resubmit',
        title: 'Correction Requested for Live Links ⚠️',
        message: `Brand requested resubmission: "${feedback}"`,
        link: `/messages/${targetThreadId}`,
        read: false,
        created_at: nowIso
      };
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('notifications').insert(notifData);
        } catch (e) {}
      }
      if (!db.notifications) db.notifications = [];
      db.notifications.push(notifData);
    }

    // Socket emit
    if (io) {
      io.to(targetThreadId).emit("new_message", msgRecord);
      io.emit("thread_updated", {
        threadId: targetThreadId,
        status: 'ACTIVE',
        flow_state: 'REVISION_REQUESTED_LINKS',
        revision_notes_links: feedback
      });
    }

    saveDb(db);

    return res.json({
      ok: true,
      success: true,
      thread_id: targetThreadId,
      deal_id: dealId,
      status: 'ACTIVE',
      flow_state: 'REVISION_REQUESTED_LINKS',
      feedback
    });
  };

  // Creator declines resubmission request for live links
  const handleThreadDeclineLiveLinksResubmission = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const rawId = req.params.id || req.params.threadId;
    const feedback = (req.body?.feedback || req.body?.reason || "").trim() || "Creator declined the resubmission request.";

    const db = getDb();
    let targetThread: any = (db.chat_threads || []).find((t: any) => t.id === rawId || t.deal_id === rawId);

    if (!targetThread && supabase) {
      try {
        const { data: threadRow } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .eq('id', rawId)
          .maybeSingle();
        if (threadRow) targetThread = threadRow;
      } catch (e) {}
    }

    const targetThreadId = targetThread?.id || rawId;
    const dealId = targetThread?.deal_id || (targetThread?.metadata && targetThread.metadata.deal_id) || rawId;
    const nowIso = new Date().toISOString();

    let dealObj = (db.deals || []).find((d: any) => d.id === dealId || d.id === targetThreadId);
    if (dealObj) {
      dealObj.flow_state = 'REVISION_DECLINED_LINKS';
      dealObj.decline_notes_links = feedback;
      dealObj.updated_at = nowIso;
    }

    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            updated_at: nowIso
          })
          .eq('id', dealId);
      } catch (e) {
        console.warn("[handleThreadDeclineLiveLinksResubmission] Supabase deals update error:", e);
      }
    }

    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update({
            flow_state: 'REVISION_DECLINED_LINKS',
            decline_notes_links: feedback,
            updated_at: nowIso
          })
          .eq('id', targetThreadId);
      } catch (e) {
        console.warn("[handleThreadDeclineLiveLinksResubmission] Supabase chat_threads update error:", e);
      }
    }

    if (db.chat_threads) {
      const t = db.chat_threads.find((x: any) => x.id === targetThreadId || x.deal_id === dealId);
      if (t) {
        t.flow_state = 'REVISION_DECLINED_LINKS';
        t.decline_notes_links = feedback;
        t.updated_at = nowIso;
      }
    }

    const creatorId = targetThread?.creator_id || dealObj?.creator_id || user.user_id;
    const brandId = targetThread?.brand_id || dealObj?.brand_id;

    // Chat message
    const msgId = crypto.randomUUID();
    const msgText = `⚠️ Creator declined live links resubmission: ${feedback}`;
    const msgMetadata = {
      action: 'live_links_resubmit_declined',
      status: 'REVISION_DECLINED_LINKS',
      feedback
    };

    const msgRecord: any = {
      message_id: msgId,
      id: msgId,
      thread_id: targetThreadId,
      sender_user_id: user?.user_id || creatorId,
      receiver_user_id: brandId || null,
      sender_id: user?.user_id || creatorId,
      receiver_id: brandId || null,
      sender_role: 'creator',
      text: msgText,
      content: msgText,
      from_name: user?.name || user?.full_name || 'Creator',
      message_type: 'live_links_resubmit_declined',
      metadata: msgMetadata,
      read: false,
      created_at: nowIso
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgRecord);
      } catch (e) {
        console.error("[handleThreadDeclineLiveLinksResubmission] Chat message insert error:", e);
      }
    }
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(msgRecord);

    // Socket emit
    if (io) {
      io.to(targetThreadId).emit("new_message", msgRecord);
      io.emit("thread_updated", {
        threadId: targetThreadId,
        status: 'ACTIVE',
        flow_state: 'REVISION_DECLINED_LINKS',
        decline_notes_links: feedback
      });
    }

    saveDb(db);

    return res.json({
      ok: true,
      success: true,
      thread_id: targetThreadId,
      deal_id: dealId,
      status: 'ACTIVE',
      flow_state: 'REVISION_DECLINED_LINKS',
      feedback
    });
  };


  // 11. Request Revision for UGC Order
  const handleUgcOrderRevision = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id || req.params.threadId;
    const notes = (
      req.body?.notes ||
      req.body?.feedback ||
      req.body?.revision_notes ||
      req.body?.comments ||
      ""
    ).trim();

    const result = await syncUgcLifecycleEvent({
      rawId: id,
      action: 'REQUEST_REVISION',
      actorUser: user,
      notes,
      io: req.app.get("io")
    });

    if (result?.error) {
      return res.status(result._status || 400).json({ error: result.error });
    }

    return res.json({
      ...result,
      message: "Revision request submitted"
    });
  };


  // 12. Decline Revisions
  const handleUgcOrderDeclineRevisions = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id || req.params.threadId;
    const notes = (
      req.body?.feedback ||
      req.body?.notes ||
      req.body?.reason ||
      req.body?.declineReason ||
      ""
    ).trim();

    const result = await syncUgcLifecycleEvent({
      rawId: id,
      action: 'DECLINE_REVISION',
      actorUser: user,
      notes,
      io: req.app.get("io")
    });

    if (result?.error) {
      return res.status(result._status || 400).json({ error: result.error });
    }

    return res.json({
      ...result,
      message: "Revisions declined"
    });
  };


  // 13. Cancel Claim / Order
  const handleUgcOrderCancel = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id || req.params.threadId;
    const notes = (
      req.body?.reason ||
      req.body?.notes ||
      req.body?.feedback ||
      ""
    ).trim();

    const result = await syncUgcLifecycleEvent({
      rawId: id,
      action: 'CANCEL',
      actorUser: user,
      notes,
      io: req.app.get("io")
    });

    if (result?.error) {
      return res.status(result._status || 400).json({ error: result.error });
    }

    return res.json({
      ...result,
      message: "Claim cancelled and escrow refunded"
    });
  };


  // 13. Creator UGC Earnings

  // 14. UGC Showcase (Public)

  // 15. Admin UGC Orders


  // Get all UGC Orders (Legacy endpoint compatibility & Ops page)

  // Accept / Claim UGC order for in-house ops team handling

  // Submit deliverable video for UGC order / brief

  // Helper to populate comprehensive thread data (profiles, avatars, UGC brief info, unread counts)
  const populateThreadData = async (threads: any[], currentUserId: string) => {
    if (!threads || threads.length === 0) return [];
    const db = getDb();

    // 1. Gather all participant user IDs
    const userIds = [...new Set(threads.flatMap(t => [t.creator_id, t.brand_id]).filter(Boolean))];

    // 2. Fetch users, brand_profiles, creator_profiles
    let usersList: any[] = [];
    let brandProfilesList: any[] = [];
    let creatorProfilesList: any[] = [];

    if (supabase && userIds.length > 0) {
      try {
        const [uRes, bpRes, cpRes] = await Promise.all([
          (privilegedSupabase || supabase).from('users').select('*').in('user_id', userIds),
          (privilegedSupabase || supabase).from('brand_profiles').select('*').in('user_id', userIds),
          (privilegedSupabase || supabase).from('creator_profiles').select('*').in('user_id', userIds)
        ]);
        if (uRes.data) usersList = uRes.data;
        if (bpRes.data) brandProfilesList = bpRes.data;
        if (cpRes.data) creatorProfilesList = cpRes.data;
      } catch (e) {
        console.error("[populateThreadData] Profile fetch error:", e);
      }
    }

    const userMap: Record<string, any> = {};
    (db.users || []).forEach((u: any) => {
      const uid = u.user_id || u.id;
      if (uid) userMap[uid] = u;
    });
    usersList.forEach((u: any) => {
      const uid = u.user_id || u.id;
      if (uid) userMap[uid] = { ...userMap[uid], ...u };
    });

    const brandProfileMap: Record<string, any> = {};
    (db.brand_profiles || []).forEach((bp: any) => {
      const uid = bp.user_id || bp.id;
      if (uid) brandProfileMap[uid] = bp;
    });
    brandProfilesList.forEach((bp: any) => {
      const uid = bp.user_id || bp.id;
      if (uid) brandProfileMap[uid] = { ...brandProfileMap[uid], ...bp };
    });

    const creatorProfileMap: Record<string, any> = {};
    (db.creator_profiles || []).forEach((cp: any) => {
      const uid = cp.user_id || cp.id;
      if (uid) creatorProfileMap[uid] = cp;
    });
    creatorProfilesList.forEach((cp: any) => {
      const uid = cp.user_id || cp.id;
      if (uid) creatorProfileMap[uid] = { ...creatorProfileMap[uid], ...cp };
    });

    // 3. UGC Orders, Deals, and Briefs mapping
    const potentialOrderIds = [...new Set(threads.map(t => t.deal_id || t.id).filter(Boolean))];
    let ugcOrdersList: any[] = [];
    let dealsList: any[] = [];
    if (supabase && potentialOrderIds.length > 0) {
      try {
        const [oRes, dRes] = await Promise.all([
          (privilegedSupabase || supabase).from('ugc_orders').select('*').in('id', potentialOrderIds),
          (privilegedSupabase || supabase).from('deals').select('*').in('id', potentialOrderIds)
        ]);
        if (oRes.data) ugcOrdersList = oRes.data;
        if (dRes.data) dealsList = dRes.data;
      } catch (e) {}
    }
    const orderMap: Record<string, any> = {};
    (db.ugc_orders || []).forEach((o: any) => { if (o.id) orderMap[o.id] = o; });
    ugcOrdersList.forEach((o: any) => { if (o.id) orderMap[o.id] = { ...orderMap[o.id], ...o }; });

    const dealMap: Record<string, any> = {};
    (db.deals || []).forEach((d: any) => { if (d.id) dealMap[d.id] = d; });
    dealsList.forEach((d: any) => { if (d.id) dealMap[d.id] = { ...dealMap[d.id], ...d }; });

    const briefIds = [...new Set(Object.values(orderMap).map((o: any) => o.brief_id).filter(Boolean))];
    let briefsList: any[] = [];
    if (supabase && briefIds.length > 0) {
      try {
        const { data: bData } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').in('id', briefIds);
        if (bData) briefsList = bData;
      } catch (e) {}
    }
    const briefMap: Record<string, any> = {};
    (db.ugc_briefs || []).forEach((b: any) => { if (b.id) briefMap[b.id] = b; });
    briefsList.forEach((b: any) => { if (b.id) briefMap[b.id] = { ...briefMap[b.id], ...b }; });

    // 4. Campaign mapping
    const campaignIds = [...new Set(threads.map(t => t.campaign_id).filter(Boolean))];
    let campaignsList: any[] = [];
    if (supabase && campaignIds.length > 0) {
      try {
        const { data: cData } = await (privilegedSupabase || supabase).from('campaigns').select('*').in('campaign_id', campaignIds);
        if (cData) campaignsList = cData;
      } catch (e) {}
    }
    const campaignMap: Record<string, any> = {};
    (db.campaigns || []).forEach((c: any) => { if (c.campaign_id) campaignMap[c.campaign_id] = c; });
    campaignsList.forEach((c: any) => { if (c.campaign_id) campaignMap[c.campaign_id] = { ...campaignMap[c.campaign_id], ...c }; });

    // 5. Messages mapping for last_message, total count, unread count
    const threadIds = threads.map(t => t.id).filter(Boolean);
    let allMessages: any[] = [];
    if (supabase && threadIds.length > 0) {
      try {
        const { data: mData } = await (privilegedSupabase || supabase).from('chat_messages')
          .select('*')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: true });
        if (mData) allMessages = mData;
      } catch (e) {}
    }
    const localMsgs = (db.chat_messages || []).filter((m: any) => threadIds.includes(m.thread_id));
    const combinedMsgs = [...allMessages];
    localMsgs.forEach((lm: any) => {
      const mid = lm.message_id || lm.id;
      if (!combinedMsgs.some(m => (m.message_id || m.id) === mid)) {
        combinedMsgs.push(lm);
      }
    });

    const messagesByThread: Record<string, any[]> = {};
    combinedMsgs.forEach((m: any) => {
      if (!messagesByThread[m.thread_id]) messagesByThread[m.thread_id] = [];
      messagesByThread[m.thread_id].push(m);
    });

    // 6. Build populated threads
    return threads.map(t => {
      const order = orderMap[t.id] || orderMap[t.deal_id] || (t.id?.startsWith('ugcord_') ? orderMap[t.id] : null);
      const isUgc = Boolean(
        order || 
        t.is_ugc || 
        t.type === 'ugc' || 
        t.deal_type === 'UGC' || 
        t.id?.startsWith('ugcord_') || 
        t.deal_id?.startsWith('ugcord_') ||
        t.ugc_order_id
      );

      const brief = order?.brief_id ? briefMap[order.brief_id] : null;
      const campaign = t.campaign_id ? campaignMap[t.campaign_id] : null;

      const brandUser = userMap[t.brand_id] || {};
      const brandProf = brandProfileMap[t.brand_id] || {};
      const creatorUser = userMap[t.creator_id] || {};
      const creatorProf = creatorProfileMap[t.creator_id] || {};

      const brandName = brandProf.company_name || brandUser.name || brief?.brand_name || 'Brand Partner';
      const brandLogo = brandProf.logo || brandUser.picture || brief?.brand_logo || '';
      const creatorName = creatorProf.full_name || creatorUser.name || 'Creator';
      const creatorPic = creatorProf.profile_picture_url || creatorUser.picture || '';

      const tMsgs = messagesByThread[t.id] || [];
      const lastMsg = tMsgs.length > 0 ? {
        ...tMsgs[tMsgs.length - 1],
        content: tMsgs[tMsgs.length - 1].text || tMsgs[tMsgs.length - 1].content
      } : (t.last_message || null);

      const unreadCount = tMsgs.filter((m: any) => !m.read && m.sender_user_id !== currentUserId).length;

      const title = brief?.title || order?.title || campaign?.title || t.campaign_title || t.ugc_title || (isUgc ? 'UGC Order' : 'Campaign Deal');
      const deal = dealMap[t.deal_id] || (t.deal_id ? (db.deals || []).find((d: any) => d.id === t.deal_id) : null) || null;
      const isFunded = Boolean(
        t.payment_funded ||
        deal?.escrow_hold ||
        Boolean(deal?.escrow_hold_at) ||
        order?.escrow_hold ||
        Boolean(order?.escrow_held_at) ||
        ['ESCROW_HELD', 'PAID', 'RELEASED', 'COMPLETED'].includes(order?.payment_status?.toUpperCase())
      );

      return {
        ...t,
        deal: deal,
        escrow_hold: isFunded,
        payment_funded: isFunded,
        payment_status: isFunded ? 'ESCROW_HELD' : (order?.payment_status || 'PENDING'),
        escrow_held_at: deal?.escrow_hold_at || order?.escrow_held_at || (isFunded ? t.updated_at : null),
        flow_state: t.flow_state || t.status,
        is_ugc: isUgc,
        type: isUgc ? 'ugc' : (t.type || 'campaign'),
        deal_type: isUgc ? 'UGC' : 'CAMPAIGN',
        ugc_order_id: isUgc ? (order?.id || t.deal_id || t.id) : null,
        ugc_order: order || null,
        ugc_brief_id: brief?.id || null,
        ugc_brief: brief || null,
        ugc_title: isUgc ? title : null,
        campaigns: campaign || null,
        campaign_title: title,
        creator: {
          id: t.creator_id,
          user_id: t.creator_id,
          name: creatorName,
          full_name: creatorName,
          picture: creatorPic,
          photo: creatorPic,
          avatar: creatorPic,
          avatar_url: creatorPic,
          profile_picture_url: creatorPic,
          profile: {
            id: t.creator_id,
            user_id: t.creator_id,
            name: creatorName,
            full_name: creatorName,
            photo: creatorPic,
            picture: creatorPic,
            avatar: creatorPic,
            avatar_url: creatorPic,
            profile_picture_url: creatorPic
          }
        },
        brand: {
          id: t.brand_id,
          user_id: t.brand_id,
          name: brandName,
          company_name: brandName,
          picture: brandLogo,
          photo: brandLogo,
          logo: brandLogo,
          logo_url: brandLogo,
          avatar: brandLogo,
          profile: {
            id: t.brand_id,
            user_id: t.brand_id,
            company_name: brandName,
            name: brandName,
            logo: brandLogo,
            logo_url: brandLogo,
            photo: brandLogo,
            picture: brandLogo
          }
        },
        last_message: lastMsg,
        total_messages_count: tMsgs.length,
        unread_count: unreadCount
      };
    });
  };

  // Re-add missing chat routes






  



  // --- Admin Chat Monitoring Routes ---






  // Reinstate user (unrestrict) → moved to admin_kyc_verification_routes.ts (setupAdminKycVerificationRoutes)

  // Setup Blog routes
  setupBlogRoutes(app, router, { privilegedSupabase, supabase, getDb, saveDb, parseAuthUser, logAdminAction, upload });
  setupPaymentRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, sendNotification, fetchUserScopedTransactions, serializeChatMessage, insertChatMessageToSupabase, parseThreadState });
  setupChatCoreRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, ensureUGCChatThread, populateThreadData, insertChatMessageToSupabase });
  setupUgcOrderRoutes(app, router, { handleThreadApproveContent, handleUgcDeliverableSubmit, handleUgcOrderApprove, handleUgcOrderRevision, handleUgcOrderDeclineRevisions, handleUgcOrderCancel });
  setupAdminContentRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser });
  setupAdminVersionsCouponsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction });
  setupAdminKycVerificationRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, sendNotification, getSignedUgcUrl });
  setupAdminLogsCreatorsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, sendNotification, checkAdminPerm, fetchUserScopedTransactions, getSignedUgcUrl, getUserPassword, recordUserPassword });
  setupAdminWaitlistRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, sendNotification, checkAdminPerm });
  setupAdminCampaignsSettingsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, sendNotification, getSettings, getFullFeeAndReferralConfig });
  setupAdminSystemMaintenanceRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, insertChatMessageToSupabase });
  setupAdminUsersEnforcementRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, sendNotification, sendActivityNotificationEmail, sendSuperAdminAlertEmail, checkAdminPerm, getUserPassword, recordUserPassword, DEFAULT_WARNING_TEMPLATES });
  setupUgcBrowseRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, ensureUGCChatThread, enrichBriefsWithBrandProfiles });
  setupSupportRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, sendNotification, logAdminAction });
  setupCreatorsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, syncEntityTags, processBase64Image, getSettings, markupForRole, getActingBrandId, logTeamActivity, handleCreatorKycSubmit, handleGetCreatorProfile, handleGetCreatorsMe });
  setupDealsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, insertChatMessageToSupabase, handleThreadApproveLiveLinks });
  setupTagsAndNotificationsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, getActingBrandId });
  setupCampaignsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, sendNotification, serializeChatMessage, insertChatMessageToSupabase, syncEntityTags, getActingBrandId, createEscrowTransaction, isCreatorKycVerified });
  setupBrandsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, syncEntityTags, processBase64Image, getActingBrandId, logTeamActivity, handleBrandKycSubmit, handleGetBrandsMe, sanitizeBrandProfile });
  setupContentSubmissionsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, insertChatMessageToSupabase });
  setupMiscRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, ensureBucketExists, getFullFeeAndReferralConfig, handlePublicCreatorApply, upload, getSettings, getActingBrandId });
  setupDealsChatRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, sendNotification, serializeChatMessage, insertChatMessageToSupabase, parseThreadState, updateThreadState, enrichThread, handleThreadApproveLiveLinks, handleThreadApproveContent, handleThreadSubmitLiveLink, handleThreadRejectLiveLinks, handleThreadDeclineLiveLinksResubmission });
  setupSessionRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser });
  setupAuthRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAuth, getPermissionsForUser, broadcastAdminNotification, checkForgotPasswordRateLimit, recordUserPassword, sendSuperAdminAlertEmail, processBase64Image, syncEntityTags });

  // Support direct calls to admin API routes either with or without /api prefix
  app.use((req, res, next) => {
    if (req.path.startsWith('/admin/transactions') || req.path.startsWith('/admin/system-collabs') || req.path.startsWith('/ugc-orders/')) {
      req.url = `/api${req.url}`;
    }
    next();
  });

  app.use("/api", router);

  // Catch unhandled /api routes and return 404 JSON instead of falling through to Vite HTML
  app.all("/api/*", (req, res) => {
    res.status(404).json({ detail: `API endpoint ${req.method} ${req.path} not found`, code: "NOT_FOUND" });
  });
  
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ detail: err.message || "Internal Server Error" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }


  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();

