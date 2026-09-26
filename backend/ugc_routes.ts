import { logIgnored } from "./logIgnored";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import { isCampaignThread } from "./dealFlow";
import { resolveUgcStage } from "./ugcOrderStage";
import {
  partyRole, isUgcOrderClosed, isUgcOrderRefunded, hasUgcDeliverable, ugcForbid, ugcConflict, isAdmin,
  orderStatus, publicBrief, UGC_DRAFT_REVISION, UGC_LIVE_LINK_DUE, UGC_LINK_WITH_BRAND
} from "./ugcGuards";
import { getRazorpay } from "./helpers";
import { resolveTestMode } from "./paymentTestMode";
import { createUgcSlots } from "./ugcSlots";
import { consumeSignToken, signOtpRequired } from "./signTokens";
import { calculateFee as calculatePlatformFee } from "../src/utils/feeCalculator";

// Supabase and the local JSON db can both hold the same UGC order. The old merge always
// preferred the Supabase copy and only fell back to the local one when Supabase had no row
// at all — so whenever a lifecycle write landed locally but not in Supabase, the stale
// Supabase row masked the fresh local one and the UI showed the pre-action state. Prefer
// whichever copy was written last, and merge the local fields on top of it so nothing an
// action recorded is lost.
export function getOrderTimestamp(record: any): number {
  if (!record) return 0;
  return Math.max(
    Date.parse(record.updated_at || '') || 0,
    Date.parse(record.delivered_at || '') || 0,
    Date.parse(record.escrow_released_at || '') || 0,
    Date.parse(record.cancelled_at || '') || 0,
    Date.parse(record.created_at || '') || 0
  );
}

// Distinguish Collaboration formats (requires creator to publish to their social profile & submit a live link)
// vs Normal UGC video formats (raw or edited video deliverable for the brand to download/use; creator does not post to own profile).
export function isCollaborationDeliverable(deliverableType?: string): boolean {
  if (!deliverableType) return true;
  const norm = String(deliverableType).toLowerCase().trim();
  if (
    norm.startsWith('ugc_video') ||
    norm.includes('raw') ||
    norm.includes('edited') ||
    norm.startsWith('video_') ||
    norm === 'ugc_video_raw' ||
    norm === 'ugc_video_edited' ||
    norm === 'ugc_raw_video'
  ) {
    return false;
  }
  if (
    norm.includes('collab') ||
    norm.includes('reel') ||
    norm === 'collaboration_reel' ||
    norm === 'instagram_reel'
  ) {
    return true;
  }
  return false;
}

export function mergeOrderRecords(remote: any, local: any) {
  if (!remote) return local;
  if (!local) return remote;
  const isCompleted = remote.status === 'COMPLETED' || local.status === 'COMPLETED' ||
    remote.payment_status === 'RELEASED' || local.payment_status === 'RELEASED' ||
    remote.payment_status === 'PAID' || local.payment_status === 'PAID';
  const remoteAt = getOrderTimestamp(remote);
  const localAt = getOrderTimestamp(local);
  const merged = localAt > remoteAt ? { ...remote, ...local } : { ...local, ...remote };

  // Preserve revision notes / feedback across merges if present on either copy
  const revisionNotes = remote.revision_notes || local.revision_notes || remote.revision_feedback || local.revision_feedback || null;
  if (revisionNotes && !merged.revision_notes) {
    merged.revision_notes = revisionNotes;
  }
  if (revisionNotes && !merged.revision_feedback) {
    merged.revision_feedback = revisionNotes;
  }

  // If remote has a deliverable submitted that is newer or matches latest delivered_at, ensure status is SUBMITTED
  if (remote.status === 'SUBMITTED' && remote.video_url && (Date.parse(remote.delivered_at || '') >= Date.parse(local.delivered_at || '') || !local.video_url)) {
    merged.status = 'SUBMITTED';
    merged.video_url = remote.video_url;
    merged.delivered_at = remote.delivered_at || merged.delivered_at;
  }

  if (isCompleted) {
    merged.status = 'COMPLETED';
    merged.payment_status = 'RELEASED';
  }
  return merged;
}


// UGC Lifecycle Handlers (Approve, Submit, Revision, Decline, Cancel)
export function createUgcLifecycleHandlers({
  supabase,
  privilegedSupabase,
  getDb,
  parseAuthUser,
  syncUgcLifecycleEvent,
  handleThreadApproveLiveLinks,
  handleThreadApproveContent,
  handleCampaignRevision,
}: {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  parseAuthUser: (req: any) => Promise<any>;
  syncUgcLifecycleEvent: (opts: any) => Promise<any>;
  handleThreadApproveLiveLinks: (req: any, res: any) => Promise<any>;
  handleThreadApproveContent: (req: any, res: any) => Promise<any>;
  handleCampaignRevision: (req: any, res: any) => Promise<any>;
}) {
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

    const db = getDb();
    let thread = (db.chat_threads || []).find((t: any) => t.id === rawId || t.deal_id === rawId);
    if (!thread && supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${rawId},deal_id.eq.${rawId}`)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e: any) { logIgnored("ugc_routes:154", e); }
    }

    const targetOrderId = thread?.deal_id || thread?.id || rawId;
    let ugcOrder = (db.ugc_orders || []).find((o: any) => o.id === rawId || o.id === targetOrderId || o.brief_id === rawId);
    if (!ugcOrder && supabase) {
      try {
        const { data: o } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${rawId},id.eq.${targetOrderId},brief_id.eq.${rawId}`)
          .maybeSingle();
        if (o) ugcOrder = o;
      } catch (e: any) { logIgnored("ugc_routes:167", e); }
    }

    // Only the creator who claimed this order can upload deliverables
    const claimedCreatorId = ugcOrder?.creator_id || thread?.creator_id;
    if (claimedCreatorId && user.role !== 'admin' && user.user_id !== claimedCreatorId) {
      return res.status(403).json({
        error: "Only the creator who claimed this video may upload deliverables.",
        code: "CREATOR_MISMATCH"
      });
    }

    // A finished order takes no more uploads, and an approved draft is not re-uploaded. A
    // submit on a COMPLETED order used to flip it back to SUBMITTED.
    if (ugcOrder && isUgcOrderClosed(ugcOrder)) {
      return ugcConflict(res, 'ORDER_CLOSED', "This order is already closed.");
    }
    if (ugcOrder && [...UGC_LIVE_LINK_DUE, ...UGC_LINK_WITH_BRAND].includes(orderStatus(ugcOrder))) {
      return ugcConflict(res, 'DRAFT_ALREADY_APPROVED', "Your draft is already approved — submit the live post link instead.");
    }

    const result = await syncUgcLifecycleEvent({
      rawId,
      action: 'SUBMIT_DELIVERABLE',
      actorUser: user,
      notes,
      videoUrl: finalVideoUrl,
      io: req.app.get("io")
    });

    if (result.error) {
      return res.status(result._status || 500).json(result);
    }

    return res.json({
      ...result,
      message: "Deliverable submitted successfully! Brand has been notified.",
      video_url: finalVideoUrl,
      notes: notes,
      status: 'SUBMITTED'
    });
  };

  const handleUgcLiveLinkSubmit = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const rawId = req.params.id || req.params.threadId;

    const db = getDb();
    let thread = (db.chat_threads || []).find((t: any) => t.id === rawId || t.deal_id === rawId);
    if (!thread && supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${rawId},deal_id.eq.${rawId}`)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e: any) { logIgnored("ugc_routes:225", e); }
    }

    const targetOrderId = thread?.deal_id || thread?.id || rawId;
    let ugcOrder = (db.ugc_orders || []).find((o: any) => o.id === rawId || o.id === targetOrderId || o.brief_id === rawId);
    if (!ugcOrder && supabase) {
      try {
        const { data: o } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${rawId},id.eq.${targetOrderId},brief_id.eq.${rawId}`)
          .maybeSingle();
        if (o) ugcOrder = o;
      } catch (e: any) { logIgnored("ugc_routes:238", e); }
    }

    // Only the creator who claimed this order can submit live links
    const claimedCreatorId = ugcOrder?.creator_id || thread?.creator_id;
    if (claimedCreatorId && user.role !== 'admin' && user.user_id !== claimedCreatorId) {
      return res.status(403).json({
        error: "Only the creator who claimed this collaboration order may submit live links.",
        code: "CREATOR_MISMATCH"
      });
    }

    if (ugcOrder && isUgcOrderClosed(ugcOrder)) {
      return ugcConflict(res, 'ORDER_CLOSED', "This order is already closed.");
    }

    const briefId = ugcOrder?.brief_id || thread?.ugc_brief_id;
    let brief = (db.ugc_briefs || []).find((b: any) => b.id === briefId);
    if (!brief && supabase && briefId) {
      try {
        const { data: b } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('id', briefId)
          .maybeSingle();
        if (b) brief = b;
      } catch (e: any) { logIgnored("ugc_routes:264", e); }
    }

    const deliverableType = String(
      ugcOrder?.deliverable_type ||
      brief?.deliverable_type ||
      thread?.deliverable_type ||
      ""
    ).toLowerCase();

    const isCollab = ugcOrder?.is_collaboration !== undefined
      ? Boolean(ugcOrder.is_collaboration)
      : (ugcOrder?.requires_live_link !== undefined
        ? Boolean(ugcOrder.requires_live_link)
        : (brief?.is_collaboration !== undefined
          ? Boolean(brief.is_collaboration)
          : (brief?.requires_live_link !== undefined
            ? Boolean(brief.requires_live_link)
            : isCollaborationDeliverable(deliverableType))));

    const requiresLiveLink = ugcOrder?.requires_live_link !== undefined
      ? Boolean(ugcOrder.requires_live_link)
      : isCollab;

    // Strict rule: DO NOT request or accept live links for UGC Raw or UGC Edited videos!
    if (!requiresLiveLink) {
      return res.status(400).json({
        error: "Live link submissions are not allowed for UGC Raw or UGC Edited videos. Only Collaboration orders require a live post link.",
        code: "LIVE_LINK_NOT_REQUIRED"
      });
    }

    const { link, links, live_link, live_links, instagram_post_url, videoUrl, video_url, url } = req.body || {};
    const rawUrl = (
      link ||
      (Array.isArray(links)
        ? (links.map((l: any) => (typeof l === 'string' ? l : l?.url || '')).find((u: string) => u.trim() !== '') || '')
        : (typeof links === 'string' ? links : (links?.url || ''))) ||
      (Array.isArray(live_links)
        ? (live_links.map((l: any) => (typeof l === 'string' ? l : l?.url || '')).find((u: string) => u.trim() !== '') || '')
        : (typeof live_links === 'string' ? live_links : (live_links?.url || ''))) ||
      live_link ||
      instagram_post_url ||
      videoUrl ||
      video_url ||
      url ||
      ""
    ).trim();

    const notes = (
      req.body?.notes ||
      req.body?.creator_notes ||
      req.body?.contentNotes ||
      req.body?.content_notes ||
      req.body?.notes_to_brand ||
      req.body?.feedback ||
      ""
    ).trim();

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
        if (!tld || tld.length < 2) return false;
        return true;
      } catch (e) {
        return false;
      }
    };

    if (!isValidLiveUrl(rawUrl)) {
      return res.status(400).json({
        error: "A valid live post link (URL) is required to submit live links proof.",
        detail: "Please provide a valid web link starting with http:// or https://"
      });
    }

    const finalLiveUrl = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`;

    const result = await syncUgcLifecycleEvent({
      rawId,
      action: 'SUBMIT_LIVE_LINK',
      actorUser: user,
      notes,
      videoUrl: finalLiveUrl,
      io: req.app?.get ? req.app.get("io") : undefined
    });

    if (result?.error) {
      return res.status(result._status || 500).json(result);
    }

    return res.json({
      ...result,
      message: "Live link submitted successfully! Brand has been notified.",
      live_link: finalLiveUrl,
      notes: notes,
      status: 'LINKS_UNDER_REVIEW'
    });
  };

  const handleUgcOrderApprove = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id || req.params.threadId;
    const notes = req.body?.notes || req.body?.feedback || "";

    const db = getDb();
    let thread = (db.chat_threads || []).find((t: any) => t.id === id || t.deal_id === id);
    if (!thread && supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${id},deal_id.eq.${id}`)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e: any) { logIgnored("ugc_routes:388", e); }
    }

    const targetOrderId = thread?.deal_id || thread?.id || id;
    let ugcOrder = (db.ugc_orders || []).find((o: any) => o.id === id || o.id === targetOrderId || o.brief_id === id);
    if (!ugcOrder && supabase) {
      try {
        const { data: o } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${id},id.eq.${targetOrderId},brief_id.eq.${id}`)
          .maybeSingle();
        if (o) ugcOrder = o;
      } catch (e: any) { logIgnored("ugc_routes:401", e); }
    }

    const targetThreadForFlow = thread || { id, deal_id: targetOrderId, ugc_order: ugcOrder };
    if (isCampaignThread(targetThreadForFlow)) {
      return handleThreadApproveLiveLinks(req, res);
    }

    const briefId = ugcOrder?.brief_id || thread?.ugc_brief_id;
    let brief = (db.ugc_briefs || []).find((b: any) => b.id === briefId);
    if (!brief && supabase && briefId) {
      try {
        const { data: b } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('id', briefId)
          .maybeSingle();
        if (b) brief = b;
      } catch (e: any) { logIgnored("ugc_routes:419", e); }
    }

    const deliverableType = String(
      ugcOrder?.deliverable_type ||
      brief?.deliverable_type ||
      thread?.deliverable_type ||
      ""
    ).toLowerCase();

    // Resolution order: order's flags, brief's flags, deliverable type
    const isCollab = ugcOrder?.is_collaboration !== undefined
      ? Boolean(ugcOrder.is_collaboration)
      : (ugcOrder?.requires_live_link !== undefined
        ? Boolean(ugcOrder.requires_live_link)
        : (brief?.is_collaboration !== undefined
          ? Boolean(brief.is_collaboration)
          : (brief?.requires_live_link !== undefined
            ? Boolean(brief.requires_live_link)
            : isCollaborationDeliverable(deliverableType))));

    const requiresLiveLink = ugcOrder?.requires_live_link !== undefined
      ? Boolean(ugcOrder.requires_live_link)
      : isCollab;

    if (!deliverableType) {
      console.error(
        "[UGC approve] no deliverable_type on order, brief or thread — defaulting to requiresLiveLink=" +
        requiresLiveLink + ". order=" + (ugcOrder?.id || id) + " brief=" + (briefId || "none")
      );
    }

    // Brand authorization check
    const orderBrandId = ugcOrder?.brand_id || thread?.brand_id || brief?.brand_id;
    // No brand on record is not permission for everyone.
    if (!orderBrandId && !isAdmin(user)) {
      return res.status(403).json({ error: "This order has no brand on record.", code: "BRAND_MISMATCH" });
    }
    if (orderBrandId && user.role !== 'admin' && user.user_id !== orderBrandId && user.parent_brand_id !== orderBrandId) {
      return res.status(403).json({
        error: "Only the brand that created this brief or an administrator may approve this order.",
        code: "BRAND_MISMATCH"
      });
    }

    // Payout recipient verification: Must release payout ONLY to the claimed creator
    const claimedCreatorId = ugcOrder?.creator_id || thread?.creator_id;
    if (!claimedCreatorId) {
      return res.status(400).json({
        error: "No claimed creator is associated with this order to release payout to.",
        code: "NO_CLAIMED_CREATOR"
      });
    }

    // A cancelled, refunded order is over. Approving it used to mark it COMPLETED / RELEASED —
    // the brand refunded AND the creator paid for the same order.
    if (ugcOrder && isUgcOrderRefunded(ugcOrder)) {
      return ugcConflict(res, 'ORDER_CANCELLED', "This order was cancelled and refunded, so it cannot be approved.");
    }
    // Nothing is approved before something was delivered. A raw order used to pay out from
    // ACCEPTED, with no video at all.
    if (ugcOrder && orderStatus(ugcOrder) !== 'COMPLETED' && !hasUgcDeliverable(ugcOrder)) {
      return ugcConflict(res, 'NOTHING_DELIVERED', "The creator has not delivered anything for this order yet.");
    }

    // Evidence that a live post actually exists (only relevant for collaboration orders)
    const hasLiveLinkEvidence = Boolean(
      thread?.flow_state === 'PROOF_SUBMITTED' ||
      thread?.live_links_submitted ||
      thread?.live_link ||
      ugcOrder?.live_link ||
      ugcOrder?.live_links_submitted ||
      ['LINKS_UNDER_REVIEW', 'LIVE_LINKS_SUBMITTED', 'PROOF_SUBMITTED'].includes(
        String(ugcOrder?.status || '').toUpperCase()
      )
    );

    const isLiveLinkApproval = Boolean(
      requiresLiveLink && (
        (req.body?.action === 'approve_live_links' && hasLiveLinkEvidence) ||
        (req.body?.action !== 'approve_draft' && (
          thread?.flow_state === 'PROOF_SUBMITTED' ||
          thread?.live_links_submitted ||
          Boolean(ugcOrder?.live_link)
        ))
      )
    );

    // Reject an explicit live-link approval when nothing was submitted
    if (requiresLiveLink && req.body?.action === 'approve_live_links' && !hasLiveLinkEvidence) {
      console.error(
        "[UGC approve] approve_live_links requested with no live link on record. order=" +
        (ugcOrder?.id || id)
      );
      return res.status(400).json({
        error: "No live post link has been submitted for this order yet, so there is nothing to approve. Ask the creator to publish the post and submit the link first.",
        code: "NO_LIVE_LINK_TO_APPROVE"
      });
    }

    // If it's a Collaboration UGC and live links are submitted, approve live links & release payout!
    if (requiresLiveLink && isLiveLinkApproval) {
      const result = await syncUgcLifecycleEvent({
        rawId: id,
        action: 'APPROVE',
        actorUser: user,
        notes,
        io: req.app.get("io"),
        isLiveLinkApproval: true
      });

      if (result?.error) {
        return res.status(result._status || 500).json(result);
      }

      return res.json({
        ...result,
        message: "Live links approved! Escrow payout released to creator."
      });
    }

    // If it's a Collaboration UGC and live links are NOT yet submitted, approve draft ONLY (do not release payout)!
    if (requiresLiveLink && !isLiveLinkApproval) {
      const result = await syncUgcLifecycleEvent({
        rawId: id,
        action: 'APPROVE_DRAFT',
        actorUser: user,
        notes,
        io: req.app.get("io")
      });

      if (result?.error) {
        return res.status(result._status || 500).json(result);
      }

      return res.json({
        ...result,
        message: "Video draft approved! Creator has been notified to submit their live post link."
      });
    }

    // Otherwise, this is a Normal UGC Video (UGC Raw / UGC Edited, requiresLiveLink === false):
    // Deliverable approval directly releases payout to the claimed creator! No live link required.
    const result = await syncUgcLifecycleEvent({
      rawId: id,
      action: 'APPROVE',
      actorUser: user,
      notes,
      io: req.app.get("io")
    });

    if (result?.error) {
      return res.status(result._status || 500).json(result);
    }

    return res.json({
      ...result,
      message: result.message || "Deliverable approved! Escrow payout released to creator."
    });
  };

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

    if (!notes) {
      return res.status(400).json({ error: "Revision notes are required. Please describe the specific changes needed." });
    }

    const db = getDb();
    let thread = (db.chat_threads || []).find((t: any) => t.id === id || t.deal_id === id);
    if (!thread && supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${id},deal_id.eq.${id}`)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e: any) { logIgnored("ugc_routes:606", e); }
    }

    const targetOrderId = thread?.deal_id || thread?.id || id;
    let ugcOrder = (db.ugc_orders || []).find((o: any) => o.id === id || o.id === targetOrderId || o.brief_id === id);
    if (!ugcOrder && supabase) {
      try {
        const { data: o } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${id},id.eq.${targetOrderId},brief_id.eq.${id}`)
          .maybeSingle();
        if (o) ugcOrder = o;
      } catch (e: any) { logIgnored("ugc_routes:619", e); }
    }

    const targetThreadForFlow = thread || { id, deal_id: targetOrderId, ugc_order: ugcOrder };
    if (isCampaignThread(targetThreadForFlow)) {
      return handleCampaignRevision(req, res);
    }

    const briefId = ugcOrder?.brief_id || thread?.ugc_brief_id;
    let brief = (db.ugc_briefs || []).find((b: any) => b.id === briefId);
    if (!brief && supabase && briefId) {
      try {
        const { data: b } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('id', briefId)
          .maybeSingle();
        if (b) brief = b;
      } catch (e: any) { logIgnored("ugc_routes:637", e); }
    }

    const deliverableType = String(
      ugcOrder?.deliverable_type ||
      brief?.deliverable_type ||
      thread?.deliverable_type ||
      ""
    ).toLowerCase();

    const isCollab = ugcOrder?.is_collaboration !== undefined
      ? Boolean(ugcOrder.is_collaboration)
      : (ugcOrder?.requires_live_link !== undefined
        ? Boolean(ugcOrder.requires_live_link)
        : (brief?.is_collaboration !== undefined
          ? Boolean(brief.is_collaboration)
          : (brief?.requires_live_link !== undefined
            ? Boolean(brief.requires_live_link)
            : isCollaborationDeliverable(deliverableType))));

    const requiresLiveLink = ugcOrder?.requires_live_link !== undefined
      ? Boolean(ugcOrder.requires_live_link)
      : isCollab;

    // Same chat timeline the order screens read, for the same reason: it is the one record of
    // this order that is always written.
    let revisionMessages: any[] = [];
    const revisionThreadId = thread?.id || ugcOrder?.thread_id || targetOrderId;
    if (supabase && revisionThreadId) {
      try {
        const { data: m } = await (privilegedSupabase || supabase)
          .from('chat_messages')
          .select('message_type, metadata, text, created_at')
          .eq('thread_id', revisionThreadId)
          .order('created_at', { ascending: false })
          .limit(40);
        if (Array.isArray(m)) revisionMessages = m;
      } catch (e: any) { logIgnored("ugc_routes:674", e); }
    }
    if (revisionMessages.length === 0) {
      revisionMessages = (db.chat_messages || []).filter((m: any) =>
        m.thread_id === revisionThreadId || m.thread_id === targetOrderId
      );
    }

    const currentStage = resolveUgcStage({
      order: ugcOrder || { id: targetOrderId },
      thread,
      messages: revisionMessages,
      requiresLiveLink
    });

    // Once the draft is approved, every further correction is about the live post — there is no
    // draft left to revise. The old chain tried to spot that from a scattered list of flags and
    // missed whenever draft_approved_at had not persisted and the thread lookup came back
    // empty, which handed the creator a "re-upload your draft" form for a live-link problem.
    // The client sends the answer explicitly now; this is the fallback for clients that do not.
    const isPastDraftApproval =
      currentStage.phase === 'CONTENT_APPROVED' ||
      currentStage.phase === 'PROOF_SUBMITTED' ||
      currentStage.phase === 'REVISION_REQUESTED_LINKS' ||
      currentStage.phase === 'REVISION_DECLINED_LINKS';

    const isLiveLinkRevision = Boolean(
      req.body?.action === 'reject_live_links' ||
      req.body?.action === 'live_links_resubmit' ||
      req.body?.action === 'live_links_resubmit_requested' ||
      req.originalUrl?.includes('reject-live-links') ||
      (requiresLiveLink && isPastDraftApproval)
    );

    // Only the brand asks for changes, and only while something is actually with them.
    // Anyone signed in could spend an order's revisions before — including the creator.
    {
      const role = partyRole(user, thread, ugcOrder);
      if (role !== 'brand' && role !== 'admin') return ugcForbid(res, 'brand');
      const phase = currentStage.phase;
      if (phase === 'COMPLETED' || phase === 'CANCELLED' || (ugcOrder && isUgcOrderClosed(ugcOrder))) {
        return ugcConflict(res, 'ORDER_CLOSED', "This order is already closed.");
      }
      const allowed = isLiveLinkRevision
        ? ['PROOF_SUBMITTED', 'REVISION_DECLINED_LINKS'].includes(phase)
        : ['SUBMITTED', 'REVISION_DECLINED'].includes(phase);
      if (!allowed) {
        return ugcConflict(res, isLiveLinkRevision ? 'NO_LINK_UNDER_REVIEW' : 'NO_DRAFT_UNDER_REVIEW',
          isLiveLinkRevision ? "There is no live link waiting for your review." : "There is no draft waiting for your review.",
          { phase });
      }
    }

    // UGC Order Revision: targetOrderId resolves to the UGC order id
    const result = await syncUgcLifecycleEvent({
      rawId: targetOrderId,
      action: isLiveLinkRevision ? 'REQUEST_LIVE_LINK_REVISION' : 'REQUEST_REVISION',
      actorUser: user,
      notes,
      io: req.app.get("io"),
      isLiveLinkRevision
    });

    if (result?.error) {
      return res.status(result._status || 400).json({ error: result.error });
    }

    return res.json({
      ...result,
      message: isLiveLinkRevision ? "Live link correction requested" : "Revision request submitted"
    });
  };

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

    const db = getDb();
    let thread = (db.chat_threads || []).find((t: any) => t.id === id || t.deal_id === id);
    if (!thread && supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${id},deal_id.eq.${id}`)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e: any) { logIgnored("ugc_routes:769", e); }
    }

    const targetOrderId = thread?.deal_id || thread?.id || id;
    let ugcOrder = (db.ugc_orders || []).find((o: any) => o.id === id || o.id === targetOrderId);
    if (!ugcOrder && supabase) {
      try {
        const { data: o } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${id},id.eq.${targetOrderId}`)
          .maybeSingle();
        if (o) ugcOrder = o;
      } catch (e: any) { logIgnored("ugc_routes:782", e); }
    }

    const isLiveLinkDecline = Boolean(
      thread?.flow_state === 'REVISION_REQUESTED_LINKS' ||
      ugcOrder?.status === 'REVISION_REQUESTED_LINKS' ||
      req.body?.action === 'decline_live_links_resubmission' ||
      req.originalUrl?.includes('decline-live-links-resubmission')
    );

    // Only the creator declines, and only a request that is actually open.
    {
      const role = partyRole(user, thread, ugcOrder);
      if (role !== 'creator' && role !== 'admin') return ugcForbid(res, 'creator');
      if (ugcOrder && isUgcOrderClosed(ugcOrder)) {
        return ugcConflict(res, 'ORDER_CLOSED', "This order is already closed.");
      }
      const st = orderStatus(ugcOrder);
      const flow = String(thread?.flow_state || '').toUpperCase();
      const open = isLiveLinkDecline
        ? (st === 'REVISION_REQUESTED_LINKS' || st === 'LIVE_LINK_REVISION_REQ' || flow === 'REVISION_REQUESTED_LINKS')
        : (UGC_DRAFT_REVISION.includes(st) || UGC_DRAFT_REVISION.includes(flow));
      if (!open) {
        return ugcConflict(res, 'NO_REQUEST_OPEN', "There is no open change request to decline.");
      }
    }

    const result = await syncUgcLifecycleEvent({
      rawId: targetOrderId,
      action: isLiveLinkDecline ? 'DECLINE_LIVE_LINKS_RESUBMIT' : 'DECLINE_REVISION',
      actorUser: user,
      notes,
      io: req.app.get("io")
    });

    if (result?.error) {
      return res.status(result._status || 400).json({ error: result.error });
    }

    return res.json({
      ...result,
      message: isLiveLinkDecline ? "Live links resubmission declined" : "Revisions declined"
    });
  };

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

    // WHO and WHEN. Anyone signed in could cancel any order (writing a "refund processed" row);
    // and the brand could cancel after the creator delivered, keep the video and get the escrow
    // back. After delivery a cancellation is a dispute, not a button.
    {
      const db = getDb();
      let thread: any = (db.chat_threads || []).find((t: any) => t.id === id || t.deal_id === id) || null;
      const orderId = thread?.ugc_order_id || thread?.deal_id || id;
      let order: any = (db.ugc_orders || []).find((o: any) => o.id === orderId || o.id === id) || null;
      if (supabase) {
        try {
          const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('id', orderId).maybeSingle();
          if (data) order = { ...(order || {}), ...data };
        } catch (e: any) { logIgnored("ugc_routes:850", e); }
        if (!thread) {
          try {
            const { data } = await (privilegedSupabase || supabase).from('chat_threads').select('*').or(`id.eq.${id},deal_id.eq.${orderId}`).limit(1);
            if (Array.isArray(data) && data[0]) thread = data[0];
          } catch (e: any) { logIgnored("ugc_routes:855", e); }
        }
      }
      if (!order && !thread) return res.status(404).json({ error: "Order not found" });
      const role = partyRole(user, thread, order);
      if (!role) return ugcForbid(res, 'party');
      if (order && isUgcOrderRefunded(order)) {
        return res.json({ ok: true, already_cancelled: true, status: 'CANCELLED', message: "This order was already cancelled." });
      }
      if (order && isUgcOrderClosed(order)) {
        return ugcConflict(res, 'ORDER_CLOSED', "This order is already closed.");
      }
      if (role === 'brand' && order && hasUgcDeliverable(order)) {
        return ugcConflict(res, 'DELIVERED_USE_DISPUTE',
          "The creator has already delivered on this order, so it can no longer be cancelled for a refund. Raise it with support from the order.");
      }
    }

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

  return {
    handleUgcDeliverableSubmit,
    handleUgcLiveLinkSubmit,
    handleUgcOrderApprove,
    handleUgcOrderRevision,
    handleUgcOrderDeclineRevisions,
    handleUgcOrderCancel
  };
}

// Thin route-registration wiring for the UGC order lifecycle (and the one
// Campaign-Deal content-approval route that shares this naming pattern).
//
// This file intentionally does NOT contain any of the actual business
// logic — every route here just forwards to an already-existing handler
// function (handleUgcOrderApprove, handleUgcDeliverableSubmit, etc.) that
// still lives in server.ts, passed in as a dependency. This makes the
// move essentially zero-risk: we're only relocating *where a route path
// is registered*, never touching what it actually does.
//
// The handler functions themselves are much bigger and reach deep into
// server.ts's shared state (supabase, db, syncUgcLifecycleEvent, etc.) —
// extracting THEM safely is a separate, more involved task for later.
export function setupUgcOrderRoutes(
  app: express.Application,
  router: express.Router,
  {
    handleThreadApproveContent,
    handleUgcDeliverableSubmit,
    handleUgcLiveLinkSubmit,
    handleUgcOrderApprove,
    handleUgcOrderRevision,
    handleUgcOrderDeclineRevisions,
    handleUgcOrderCancel,
  }: {
    handleThreadApproveContent: (req: express.Request, res: express.Response) => any;
    handleUgcDeliverableSubmit: (req: express.Request, res: express.Response) => any;
    handleUgcLiveLinkSubmit?: (req: express.Request, res: express.Response) => any;
    handleUgcOrderApprove: (req: express.Request, res: express.Response) => any;
    handleUgcOrderRevision: (req: express.Request, res: express.Response) => any;
    handleUgcOrderDeclineRevisions: (req: express.Request, res: express.Response) => any;
    handleUgcOrderCancel: (req: express.Request, res: express.Response) => any;
  }
) {
  // UGC thread routes namespace
  router.post([
    "/ugc/threads/:id/reject-content",
    "/ugc/threads/:id/request-revision",
    "/ugc/threads/:id/reject-live-links"
  ], handleUgcOrderRevision);
  router.post(["/ugc/threads/:id/mark-complete", "/ugc/threads/:id/approve"], handleUgcOrderApprove);
  // Was wired straight to handleThreadApproveContent, which bypassed the deliverable-type
  // routing in handleUgcOrderApprove entirely. Every approval through this path therefore
  // behaved like a collaboration: "draft approved, now submit your live link" — even for a
  // raw UGC order that should have released the payout on the spot. Same handler as
  // /approve and /mark-complete now, so all three decide identically.
  router.post(["/ugc/threads/:id/approve-content", "/ugc/threads/:id/content/approve"], handleUgcOrderApprove);
  router.post([
    "/ugc/threads/:id/decline-revisions",
    "/ugc/threads/:id/decline-live-links-resubmission"
  ], handleUgcOrderDeclineRevisions);
  router.post(["/ugc/threads/:id/cancel-order", "/ugc/threads/:id/cancel-claim"], handleUgcOrderCancel);
  router.post([
    "/ugc/threads/:id/submit-live-link",
    "/ugc/threads/:id/submit-live-links",
    "/ugc/orders/:id/submit-live-link",
    "/ugc/orders/:id/submit-live-links",
    "/ugc/order/:id/submit-live-link"
  ], handleUgcLiveLinkSubmit || handleUgcDeliverableSubmit);
  router.post(["/ugc/threads/:id/submit-content", "/ugc/threads/:id/submit-draft"], handleUgcDeliverableSubmit);

  // UGC order routes
  router.post(["/ugc/orders/:id/submit", "/ugc/order/:id/submit"], handleUgcDeliverableSubmit);
  router.post(["/ugc/orders/:id/approve", "/ugc/order/:id/approve"], handleUgcOrderApprove);
  router.post([
    "/ugc/orders/:id/revision",
    "/ugc/order/:id/revision",
    "/ugc/orders/:id/reject-live-links",
    "/ugc/order/:id/reject-live-links"
  ], handleUgcOrderRevision);
  router.post([
    "/ugc/orders/:id/decline-revisions",
    "/ugc/order/:id/decline-revisions",
    "/ugc/orders/:id/decline-live-links-resubmission",
    "/ugc/order/:id/decline-live-links-resubmission"
  ], handleUgcOrderDeclineRevisions);
  router.post(["/ugc/orders/:id/cancel-claim", "/ugc/order/:id/cancel-claim", "/ugc/orders/:id/cancel", "/ugc/order/:id/cancel"], handleUgcOrderCancel);

  // Legacy draft/content submit aliases
  router.post("/chat/v2/threads/:threadId/content/approve", (req, res) => handleThreadApproveContent(req, res));
  router.post([
    "/chat/v2/threads/:threadId/submit-content",
    "/chat/v2/threads/:threadId/submit-draft",
    "/chat/v2/threads/:id/submit-content",
    "/chat/v2/threads/:id/submit-draft"
  ], handleUgcDeliverableSubmit);
}

// UGC brief browsing, order claiming/signing, brand/creator order listing,
// UGC-specific earnings/showcase views, and the internal ops-team pages
// (admin/ugc/orders, and the hyphenated /ugc-orders/... internal team
// flow). This is the "browse and discover" half of the UGC domain — the
// lifecycle-action routes (approve/revision/decline/cancel) already live
// in setupUgcOrderRoutes below, in this same file.
export function setupUgcBrowseRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    ensureUGCChatThread,
    enrichBriefsWithBrandProfiles,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    ensureUGCChatThread: (order: any, brief: any, user: any, io: any) => Promise<any>;
    enrichBriefsWithBrandProfiles: (briefs: any[]) => Promise<any[]>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  // Loads the chat thread and its lifecycle messages for one UGC order.
  //
  // Both order-list routes used to select only five thread columns
  // ('id, deal_id, status, flow_state, updated_at') while the code below them read
  // thr.live_links_submitted, thr.live_link, thr.revision_notes, thr.revision_notes_links and
  // thr.decline_notes_links — every one of those was silently undefined on the Supabase path.
  // Selecting '*' costs one row and makes those reads mean what they say.
  //
  // The messages matter more. chat_messages is written on every lifecycle event and has no
  // column whitelist to fall through, which is why the chat screen stayed correct while the
  // Manage Orders screens went stale. Reading it here is what actually keeps the two in sync.
  // Manage Orders used to run ~5 Supabase queries PER ORDER (brief, user, profile, thread,
  // messages), all orders at once with no limit, every 20 s poll. The lookups that are the same
  // for many orders are now fetched once per request, and the per-order thread/message reads run
  // at most 6 at a time.
  const makeLimiter = (n: number) => {
    let active = 0;
    const queue: Array<() => void> = [];
    const pump = () => {
      if (active >= n || queue.length === 0) return;
      active++;
      queue.shift()!();
    };
    return <T>(fn: () => Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        queue.push(() => {
          fn().then(resolve, reject).finally(() => { active--; pump(); });
        });
        pump();
      });
  };

  const prefetchOrderRefs = async (orders: any[]) => {
    const briefs = new Map<string, any>();
    const users = new Map<string, any>();
    const profiles = new Map<string, any>();
    if (!supabase) return { briefs, users, profiles, ready: false };
    const briefIds = [...new Set(orders.map((o: any) => o.brief_id).filter(Boolean))];
    const creatorIds = [...new Set(orders.map((o: any) => o.creator_id).filter(Boolean))];
    const c = privilegedSupabase || supabase;
    try {
      const [bRes, uRes, pRes]: any = await Promise.all([
        briefIds.length ? c.from('ugc_briefs').select('*').in('id', briefIds) : Promise.resolve({ data: [] }),
        creatorIds.length ? c.from('users').select('user_id, name, picture, email').in('user_id', creatorIds) : Promise.resolve({ data: [] }),
        creatorIds.length ? c.from('creator_profiles').select('user_id, name, picture, photo, avatar_url, instagram_handle').in('user_id', creatorIds) : Promise.resolve({ data: [] }),
      ]);
      (bRes?.data || []).forEach((b: any) => briefs.set(b.id, b));
      (uRes?.data || []).forEach((u: any) => users.set(u.user_id, u));
      (pRes?.data || []).forEach((p: any) => profiles.set(p.user_id, p));
      return { briefs, users, profiles, ready: true };
    } catch (e) {
      return { briefs, users, profiles, ready: false };
    }
  };

  const loadUgcThreadContext = async (o: any, db: any): Promise<{ thr: any; messages: any[] }> => {
    let thr: any = null;
    if (supabase) {
      try {
        const threadFilter = [
          `id.eq.${o.id}`,
          `deal_id.eq.${o.id}`,
          o.thread_id ? `id.eq.${o.thread_id}` : null,
          o.deal_id ? `deal_id.eq.${o.deal_id}` : null,
          o.deal_id ? `id.eq.${o.deal_id}` : null,
          o.chat_thread_id ? `id.eq.${o.chat_thread_id}` : null
        ].filter(Boolean).join(',');

        const { data: tData } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(threadFilter)
          .maybeSingle();
        if (tData) thr = tData;
      } catch (e: any) { logIgnored("ugc_routes:1092", e); }
    }
    if (!thr) {
      thr = (db.chat_threads || []).find((t: any) =>
        t.id === o.id || t.deal_id === o.id ||
        (o.thread_id && (t.id === o.thread_id || t.deal_id === o.thread_id)) ||
        (o.deal_id && (t.id === o.deal_id || t.deal_id === o.deal_id))
      ) || null;
    }

    const threadId = thr?.id || o.thread_id || o.id;
    let messages: any[] = [];
    if (supabase && threadId) {
      try {
        const { data: mData } = await (privilegedSupabase || supabase)
          .from('chat_messages')
          .select('message_id, thread_id, message_type, metadata, text, created_at')
          .eq('thread_id', threadId)
          .order('created_at', { ascending: false })
          .limit(40);
        if (Array.isArray(mData)) messages = mData;
      } catch (e: any) { logIgnored("ugc_routes:1113", e); }
    }
    if (messages.length === 0) {
      messages = (db.chat_messages || []).filter((m: any) =>
        m.thread_id === threadId || m.thread_id === o.id
      );
    }

    return { thr, messages };
  };

  router.post("/ugc-orders/:orderId/in-house", async (req, res) => {
    // No authentication before. Now: the brief's brand or an admin.
    const viewer = await parseAuthUser(req);
    if (!viewer) return res.status(401).json({ error: "Unauthorized" });
    const { orderId } = req.params;
    const db = getDb();
    let order = (db.ugc_orders || []).find((o: any) => o.id === orderId || o.brief_id === orderId);
    {
      const ownerBrief = (db.ugc_briefs || []).find((b: any) => b.id === (order?.brief_id || orderId));
      const ownerBrandId = order?.brand_id || ownerBrief?.brand_id;
      const actingBrand = viewer.parent_brand_id || viewer.user_id;
      if (!isAdmin(viewer) && (!ownerBrandId || ownerBrandId !== actingBrand)) {
        return res.status(403).json({ error: "Only the brand that posted this brief can do this." });
      }
      if (order && isUgcOrderClosed(order)) {
        return res.status(409).json({ error: "This order is already closed." });
      }
    }
    if (order) {
      order.in_house_assigned = true;
      order.status = "IN_HOUSE_ASSIGNED";
      saveDb(db);
    } else {
      const brief = (db.ugc_briefs || []).find((b: any) => b.id === orderId);
      if (brief) {
        const newOrder = {
          id: 'ugcord_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
          brief_id: brief.id,
          brand_id: brief.brand_id,
          // No hardcoded creator account and no invented ₹50,000: the in-house team is assigned
          // by an admin, at the brief's own budget.
          creator_id: null,
          creator_payout: Number(brief.budget) || 0,
          agreed_amount: Number(brief.budget) || 0,
          status: "IN_HOUSE_ASSIGNED",
          in_house_assigned: true,
          created_at: getIsoNow()
        };
        if (!db.ugc_orders) db.ugc_orders = [];
        db.ugc_orders.unshift(newOrder);
        saveDb(db);
      }
    }
    res.json({ ok: true, message: "In-house SLA override triggered" });
  });

  router.post("/ugc/ai-generate-brief", async (req, res) => {
    const { product_name, category, target_audience, focus_area, current_title, current_requirements } = req.body || {};

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const prompt = `You are a high-performing D2C UGC (User Generated Content) Creative Director.
Generate a structured, authentic, high-converting UGC campaign brief based on this input:
- Product Name: ${product_name || "D2C Brand Product"}
- Category: ${category || "Lifestyle, Beauty, D2C, Tech or Fitness"}
- Target Audience: ${target_audience || "Gen Z & Millennial consumers"}
- Focus/Hook: ${focus_area || "High-converting authentic proof and lifestyle integration"}
- Current Title: ${current_title || "None"}
- Current Requirements: ${current_requirements || "None"}

Respond with ONLY a valid raw JSON object (no markdown, no backticks, no code fence) matching this schema:
{
  "title": "<Catchy concise campaign title, e.g. 30s Honest Skin Texture & Glow Routine>",
  "product_name": "<Refined product name>",
  "product_description": "<Compelling 1-2 sentence product description under 40 words>",
  "detailed_requirements": "<Actionable creator instructions: 3s hook, key benefit in use, natural daylight demonstration, and crisp CTA. Under 100 words>",
  "dos": [
    "<Direct rule 1>",
    "<Direct rule 2>",
    "<Direct rule 3>"
  ],
  "donts": [
    "<Restriction 1>",
    "<Restriction 2>"
  ],
  "recommended_format": "collaboration_reel",
  "recommended_duration": "30s"
}`;

        const aiCallPromise = ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: prompt,
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AI generation timeout")), 5000)
        );

        const aiRes: any = await Promise.race([aiCallPromise, timeoutPromise]);
        const rawText = (aiRes.text || "").trim().replace(/^```json\s*|```$/g, "");
        const parsed = JSON.parse(rawText);
        return res.json({ ok: true, data: parsed });
      } catch (err: any) {
        console.error("[POST /ugc/ai-generate-brief] Gemini error, using fallback:", err?.message || err);
      }
    }

    const pName = product_name || "Premium Everyday Essential";
    return res.json({
      ok: true,
      data: {
        title: `${pName} Real Life Review & Demo`,
        product_name: pName,
        product_description: "High-performance formula designed for noticeable everyday results and authentic social proof.",
        detailed_requirements: "Hook viewers in the first 3 seconds with a relatable problem. Show product unboxing, close-up texture in natural daylight, real application, and conclude with a crisp CTA to check the link.",
        dos: [
          "Shoot vertical 9:16 format in bright natural daylight",
          "Highlight close-up product texture and immediate reaction",
          "Include high-contrast captions during the hook"
        ],
        donts: [
          "Do not mention competitor brand names or comparison pricing",
          "Avoid artificial skin smoothing filters or distorted lighting"
        ],
        recommended_format: "collaboration_reel",
        recommended_duration: "30s"
      }
    });
  });

  router.post("/ugc/briefs", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required", detail: "Please log in to post a UGC brief." });
    }

    // Brands post briefs. A creator account could post one before.
    if (!['brand', 'admin'].includes(String(user.role || '').toLowerCase())) {
      return res.status(403).json({ error: "Only brand accounts can post UGC briefs." });
    }

    const body = req.body || {};
    const briefId = `brief_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`;
    const deliverableType = body.deliverable_type || body.format || "collaboration_reel";
    const isCollab = body.is_collaboration !== undefined
      ? Boolean(body.is_collaboration)
      : (body.requires_live_link !== undefined
        ? Boolean(body.requires_live_link)
        : isCollaborationDeliverable(deliverableType));
    const requiresLiveLink = body.requires_live_link !== undefined
      ? Boolean(body.requires_live_link)
      : isCollab;
    const budget = Math.max(1, Number(body.budget) || 1);
    const maxCreators = Math.max(1, Number(body.max_creators) || 1);
    // The escrow is what the brief promises to pay out — never a number the client names.
    const totalBudget = budget * maxCreators;

    // PAYMENT. This route used to create the brief and write a local "SUCCESS / escrow_hold"
    // transaction without looking at any payment at all, and reply "payment held in Escrow!".
    // The real Razorpay payment was recorded nowhere (verify had no deal/brief to attach it to).
    // Now the brief is created only against a PAID Razorpay order that covers the escrow and
    // has not already funded another brief. Test mode keeps the simulated checkout working.
    const paymentOrderId = String(body.razorpay_order_id || body.order_id || "").trim();
    const testMode = resolveTestMode(process.env);
    if (!testMode) {
      if (!paymentOrderId.startsWith("order_")) {
        return res.status(402).json({ error: "Payment is required to post a brief.", code: 'PAYMENT_REQUIRED' });
      }
      try {
        const rzpOrder: any = await getRazorpay().orders.fetch(paymentOrderId);
        const paidRupees = Number(rzpOrder?.amount_paid || 0) / 100;
        if (String(rzpOrder?.status || '').toLowerCase() !== 'paid') {
          return res.status(402).json({ error: "The payment for this brief has not completed.", code: 'PAYMENT_NOT_COMPLETED' });
        }
        if (paidRupees + 0.5 < totalBudget) {
          return res.status(402).json({ error: `The payment (₹${paidRupees}) does not cover the escrow (₹${totalBudget}).`, code: 'PAYMENT_TOO_LOW' });
        }
      } catch (e: any) {
        return res.status(502).json({ error: "The payment could not be confirmed with Razorpay. Please retry in a moment.", code: 'PAYMENT_UNCONFIRMED' });
      }
    }
    if (paymentOrderId) {
      const dbCheck = getDb();
      let used = (dbCheck.transactions || []).some((t: any) => t.razorpay_order_id === paymentOrderId || t.zaakpay_order_id === paymentOrderId);
      if (!used && supabase) {
        try {
          const { data: prior } = await (privilegedSupabase || supabase)
            .from('transactions').select('id').eq('zaakpay_order_id', paymentOrderId).limit(1);
          used = Array.isArray(prior) && prior.length > 0;
        } catch (e: any) { logIgnored("ugc_routes:1308", e); }
      }
      if (used) {
        return res.status(409).json({ error: "This payment has already been used for another brief.", code: 'PAYMENT_ALREADY_USED' });
      }
    }
    const brandName = user.name || user.company_name || body.brand_name || "Brand Partner";

    const newBrief = {
      id: briefId,
      brand_id: user.user_id,
      brand_name: brandName,
      title: body.title || `Review of ${body.product_name || "Product"}`,
      product_name: body.product_name || "",
      product_description: body.product_description || "",
      detailed_requirements: body.detailed_requirements || "",
      sample_content_url: body.sample_content_url || "",
      deliverable_type: deliverableType,
      is_collaboration: isCollab,
      requires_live_link: requiresLiveLink,
      format_category: isCollab ? 'collaboration' : 'ugc_video',
      video_duration: body.video_duration || "30s",
      budget: budget,
      max_creators: maxCreators,
      claimed_count: 0,
      status: 'OPEN',
      dos: Array.isArray(body.dos) ? body.dos.filter((d: any) => typeof d === 'string' && d.trim().length > 0) : [],
      donts: Array.isArray(body.donts) ? body.donts.filter((d: any) => typeof d === 'string' && d.trim().length > 0) : [],
      created_at: getIsoNow()
    };

    if (supabase) {
      try {
        const supaPayload = {
          id: briefId,
          brand_id: user.user_id,
          brand_name: brandName,
          title: newBrief.title,
          product_name: newBrief.product_name,
          product_description: newBrief.product_description,
          detailed_requirements: newBrief.detailed_requirements,
          sample_content_url: newBrief.sample_content_url,
          deliverable_type: deliverableType,
          video_duration: newBrief.video_duration,
          budget: budget,
          max_creators: maxCreators,
          claimed_count: 0,
          status: 'OPEN',
          dos: newBrief.dos,
          donts: newBrief.donts,
          created_at: newBrief.created_at
        };
        const { error } = await (privilegedSupabase || supabase).from('ugc_briefs').insert(supaPayload);
        if (error) {
          console.error("[POST /ugc/briefs] Supabase insert error:", error);
        }
      } catch (err) {
        console.error("[POST /ugc/briefs] Supabase insert caught error:", err);
      }
    }

    const db = getDb();
    if (!db.ugc_briefs) db.ugc_briefs = [];
    db.ugc_briefs.unshift(newBrief);

    // Record the escrow deposit against the payment that funded it — in Supabase too, so the
    // payment is on record and cannot fund a second brief.
    if (supabase && paymentOrderId) {
      try {
        const { error: txErr } = await (privilegedSupabase || supabase).from('transactions').insert({
          id: crypto.randomUUID(),
          zaakpay_order_id: paymentOrderId,
          gross_amount: totalBudget,
          platform_fee_amount: 0,
          creator_net_amount: totalBudget,
          gst_amount: 0,
          status: 'SUCCESS',
          payout_status: 'PENDING',
          payout_type: 'full',
          created_at: getIsoNow()
        });
        if (txErr) console.error("[POST /ugc/briefs] escrow transaction insert failed:", txErr.message || txErr);
      } catch (e: any) {
        console.error("[POST /ugc/briefs] escrow transaction insert threw:", e?.message || e);
      }
    }
    if (!db.transactions) db.transactions = [];
    db.transactions.unshift({
      id: crypto.randomUUID(),
      transaction_id: `txn_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
      razorpay_order_id: paymentOrderId || null,
      brief_id: briefId,
      brand_id: user.user_id,
      gross_amount: totalBudget,
      platform_fee_amount: 0,
      creator_net_amount: totalBudget,
      gst_amount: 0,
      status: 'SUCCESS',
      escrow_hold: true,
      payout_status: 'PENDING',
      payout_type: 'full',
      created_at: getIsoNow()
    });
    saveDb(db);

    return res.json({ ok: true, brief: newBrief, message: "Brief posted and payment held in Escrow!" });
  });


  router.get("/ugc/briefs/my", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let briefs: any[] = [];
    if (supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('brand_id', user.user_id)
          .order('created_at', { ascending: false });
        if (!error && data) {
          briefs = data;
        }
      } catch (e) {
        console.error("[GET /ugc/briefs/my] Supabase query error:", e);
      }
    }

    const db = getDb();
    const localBriefs = (db.ugc_briefs || []).filter((b: any) => b.brand_id === user.user_id);
    const combinedMap = new Map();
    briefs.forEach((b: any) => combinedMap.set(b.id, b));
    localBriefs.forEach((b: any) => {
      if (!combinedMap.has(b.id)) combinedMap.set(b.id, b);
    });
    const finalBriefs = Array.from(combinedMap.values());

    // Fetch matching orders for applications count
    let allOrders: any[] = [];
    if (supabase) {
      try {
        const { data: ords } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .eq('brand_id', user.user_id);
        if (ords) allOrders = ords;
      } catch (e: any) { logIgnored("ugc_routes:1455", e); }
    }
    const localOrders = (db.ugc_orders || []).filter((o: any) => o.brand_id === user.user_id);
    const allOrdersMap = new Map();
    allOrders.forEach((o: any) => allOrdersMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      if (!allOrdersMap.has(o.id)) allOrdersMap.set(o.id, o);
    });
    const mergedOrders = Array.from(allOrdersMap.values());

    // Gather creator details for all orders to ensure real creator data is returned
    const creatorIds = Array.from(new Set(mergedOrders.map((o: any) => o.creator_id).filter(Boolean)));
    const creatorMap = new Map<string, any>();
    if (supabase && creatorIds.length > 0) {
      try {
        const [uRes, cpRes] = await Promise.all([
          (privilegedSupabase || supabase)
            .from('users')
            .select('user_id, name, picture, email')
            .in('user_id', creatorIds),
          (privilegedSupabase || supabase)
            .from('creator_profiles')
            .select('user_id, name, picture, photo, avatar_url, instagram_handle')
            .in('user_id', creatorIds)
        ]);
        const usersList = uRes?.data || [];
        const profilesList = cpRes?.data || [];
        creatorIds.forEach((cid: string) => {
          const u = usersList.find((x: any) => x.user_id === cid);
          const cp = profilesList.find((x: any) => x.user_id === cid);
          if (u || cp) {
            const resolvedName = u?.name || cp?.name || "Verified UGC Creator";
            const resolvedAvatar = cp?.picture || cp?.photo || cp?.avatar_url || u?.picture || null;
            creatorMap.set(cid, {
              id: cid,
              user_id: cid,
              name: resolvedName,
              full_name: resolvedName,
              avatar: resolvedAvatar,
              picture: resolvedAvatar,
              photo: resolvedAvatar,
              email: u?.email || null,
              instagram_handle: cp?.instagram_handle || null
            });
          }
        });
      } catch (e) {
        console.error("[GET /ugc/briefs/my] Error loading creator info:", e);
      }
    }

    const populatedBriefs = finalBriefs.map((b: any) => {
      const matching = mergedOrders.filter((o: any) => o.brief_id === b.id);
      const isEveryOrderCompleted = matching.length > 0 && matching.every((o: any) => 
        ['COMPLETED', 'PAID', 'RELEASED'].includes(String(o.status || '').toUpperCase()) ||
        ['RELEASED', 'PAID'].includes(String(o.payment_status || '').toUpperCase())
      );
      const isCompleted = b.status === 'COMPLETED' || isEveryOrderCompleted;
      const statusToReturn = isCompleted ? 'COMPLETED' : b.status;

      if (isCompleted && b.status !== 'COMPLETED') {
        b.status = 'COMPLETED';
        if (supabase) {
          (privilegedSupabase || supabase).from('ugc_briefs').update({ status: 'COMPLETED' }).eq('id', b.id).then().catch(() => {});
        }
        const localBriefRecord = (db.ugc_briefs || []).find((lb: any) => lb.id === b.id);
        if (localBriefRecord) localBriefRecord.status = 'COMPLETED';
      }

      // Populate creator inside matching orders
      const matchingPopulated = matching.map((o: any) => {
        const cr = creatorMap.get(o.creator_id) || (db.users || []).find((u: any) => u.user_id === o.creator_id || u.id === o.creator_id);
        const crName = cr?.name || o.creator_name || "Verified UGC Creator";
        const crAvatar = cr?.avatar || cr?.picture || cr?.photo || o.creator_avatar || null;
        return {
          ...o,
          creator: cr ? { ...cr, name: crName, avatar: crAvatar, picture: crAvatar } : { name: crName, avatar: crAvatar },
          creator_name: crName,
          creator_avatar: crAvatar
        };
      });

      return {
        ...b,
        status: statusToReturn,
        orders: matchingPopulated,
        applications: matchingPopulated.map((o: any) => ({
          creator_id: o.creator_id,
          creator_name: o.creator_name || "Verified UGC Creator",
          creator_avatar: o.creator_avatar || null,
          creator_picture: o.creator_avatar || null,
          creator_username: o.creator?.instagram_handle || null,
          status: o.status,
          order_id: o.id
        }))
      };
    });

    const enriched = await enrichBriefsWithBrandProfiles(populatedBriefs);
    return res.json(enriched);
  });


  router.get("/ugc/briefs/available", async (req, res) => {
    let briefs: any[] = [];
    if (supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('status', 'OPEN')
          .order('created_at', { ascending: false });
        if (!error && data) {
          briefs = data;
        }
      } catch (e) {
        console.error("[GET /ugc/briefs/available] Supabase error:", e);
      }
    }

    const db = getDb();
    const localBriefs = (db.ugc_briefs || []).filter((b: any) => (b.status || 'OPEN') === 'OPEN');
    const combinedMap = new Map();
    briefs.forEach((b: any) => combinedMap.set(b.id, b));
    localBriefs.forEach((b: any) => {
      if (!combinedMap.has(b.id)) combinedMap.set(b.id, b);
    });
    const mockBrandNames = new Set(["Test Ravi", "Nexus Brands", "Nexus Brands Inc.", "Urban Kicks Studio", "FitGlow Nutrition"]);
    const finalBriefs = Array.from(combinedMap.values()).filter((b: any) => {
      if (
        mockBrandNames.has(b.brand_name) ||
        b.brand_name?.toLowerCase().includes("nexus") ||
        b.brand_name?.toLowerCase().includes("ravi") ||
        b.id?.startsWith('brief_test_ravi') ||
        b.id?.startsWith('brief_nexus_demo')
      ) {
        return false;
      }
      const maxC = Number(b.max_creators) || 1;
      const claimedC = Number(b.claimed_count) || 0;
      return claimedC < maxC;
    });

    const enriched = await enrichBriefsWithBrandProfiles(finalBriefs);
    // Logged-out visitors get the listing only; requirements, references and the rest of the
    // brief are for signed-in users.
    const viewer = await parseAuthUser(req).catch(() => null);
    if (!viewer) return res.json(enriched.map(publicBrief));
    return res.json(enriched);
  });


  router.get("/ugc/briefs/:id", async (req, res) => {
    const { id } = req.params;
    let brief: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', id).maybeSingle();
        if (data) brief = data;
      } catch (e: any) { logIgnored("ugc_routes:1614", e); }
    }
    if (!brief) {
      const db = getDb();
      brief = (db.ugc_briefs || []).find((b: any) => b.id === id);
    }
    if (!brief) return res.status(404).json({ error: "UGC Brief not found" });

    const [enriched] = await enrichBriefsWithBrandProfiles([brief]);
    return res.json(enriched || brief);
  });


  router.get("/ugc/orders/brand", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let orders: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .eq('brand_id', user.user_id)
          .order('created_at', { ascending: false });
        if (data) orders = data;
      } catch (e: any) { logIgnored("ugc_routes:1640", e); }
    }

    const db = getDb();
    const localOrders = (db.ugc_orders || []).filter((o: any) => o.brand_id === user.user_id);
    const combinedMap = new Map();
    orders.forEach((o: any) => combinedMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      combinedMap.set(o.id, mergeOrderRecords(combinedMap.get(o.id), o));
    });
    const finalOrders = Array.from(combinedMap.values());

    const refs = await prefetchOrderRefs(finalOrders);
    const limitThreadLoad = makeLimiter(6);
    const populated = await Promise.all(finalOrders.map(async (o: any) => {
      let brief = null;
      if (supabase && o.brief_id) {
        try {
          const b = refs.ready
            ? (refs.briefs.get(o.brief_id) || null)
            : (await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', o.brief_id).maybeSingle()).data;
          if (b) brief = b;
        } catch (e) { logIgnored("ugc_routes:1663", e); }
      }
      if (!brief) {
        brief = (db.ugc_briefs || []).find((b: any) => b.id === o.brief_id);
      }
      let creator: any = null;
      if (supabase && o.creator_id) {
        try {
          const [uRes, cpRes]: any = refs.ready
            ? [{ data: refs.users.get(o.creator_id) || null }, { data: refs.profiles.get(o.creator_id) || null }]
            : await Promise.all([
                (privilegedSupabase || supabase).from('users').select('user_id, name, picture, email').eq('user_id', o.creator_id).maybeSingle(),
                (privilegedSupabase || supabase).from('creator_profiles').select('user_id, name, picture, photo, avatar_url, instagram_handle').eq('user_id', o.creator_id).maybeSingle()
              ]);
          const u = uRes?.data;
          const cp = cpRes?.data;
          if (u || cp) {
            const resolvedName = u?.name || cp?.name || "Verified UGC Creator";
            const resolvedAvatar = cp?.picture || cp?.photo || cp?.avatar_url || u?.picture || null;
            creator = {
              id: o.creator_id,
              user_id: o.creator_id,
              name: resolvedName,
              full_name: resolvedName,
              avatar: resolvedAvatar,
              picture: resolvedAvatar,
              photo: resolvedAvatar,
              email: u?.email || null,
              instagram_handle: cp?.instagram_handle || null
            };
          }
        } catch(e) {
          console.warn("[ugc/orders/brand] Creator query warning:", e);
        }
      }
      if (!creator) {
        const localUser = (db.users || []).find((u: any) => u.user_id === o.creator_id || u.id === o.creator_id);
        if (localUser) {
          creator = {
            id: localUser.user_id || localUser.id,
            user_id: localUser.user_id || localUser.id,
            name: localUser.name || "Verified UGC Creator",
            avatar: localUser.picture || localUser.avatar || null,
            picture: localUser.picture || localUser.avatar || null,
            email: localUser.email || null
          };
        }
      }

      // Check chat thread + chat timeline so this screen can never disagree with the chat screen
      const { thr, messages: threadMessages } = await limitThreadLoad(() => loadUgcThreadContext(o, db));

      let resolvedRevisionNotes = o.revision_notes || o.revision_feedback || null;
      if (!resolvedRevisionNotes && typeof o.creator_notes === 'string' && o.creator_notes.includes('Revision feedback:')) {
        resolvedRevisionNotes = o.creator_notes.replace(/^Revision feedback:\s*/i, '').trim();
      }
      if (!resolvedRevisionNotes && (thr?.revision_notes || thr?.revision_feedback)) {
        resolvedRevisionNotes = thr.revision_notes || thr.revision_feedback;
      }

      const resolvedLiveLink = o.live_link || (Array.isArray(o.live_links) ? o.live_links[0] : o.live_links) || thr?.live_link || (Array.isArray(thr?.live_links) ? thr?.live_links[0] : thr?.live_links) || null;
      const resolvedDeliverableType = o.deliverable_type || brief?.deliverable_type || 'collaboration_reel';
      const isCollab = o.is_collaboration !== undefined
        ? Boolean(o.is_collaboration)
        : (brief?.is_collaboration !== undefined
          ? Boolean(brief.is_collaboration)
          : isCollaborationDeliverable(resolvedDeliverableType));
      const requiresLiveLink = o.requires_live_link !== undefined
        ? Boolean(o.requires_live_link)
        : (brief?.requires_live_link !== undefined
          ? Boolean(brief.requires_live_link)
          : isCollab);

      // One resolver, shared with /ugc/orders/creator and fed by the chat timeline. The chain
      // that used to sit here recognised 'CONTENT_APPROVED' but not 'AWAITING_LIVE_LINK' — the
      // token the lifecycle actually writes on a draft approval — so a collaboration order that
      // had been approved kept reporting "draft under review" to the brand.
      const resolved = resolveUgcStage({
        order: { ...o, live_link: resolvedLiveLink },
        thread: thr,
        messages: threadMessages,
        requiresLiveLink
      });

      const isCompleted = resolved.isCompleted;
      const activeStatus = resolved.status;
      const isContentApproved = resolved.isContentApproved;
      const brandStage = resolved.brandStage;

      // Keep draft_approved_at in step when the stage came from chat rather than the column.
      // Non-fatal: if the column is absent this write fails and the resolver still works,
      // because it never depended on the column in the first place.
      if (isContentApproved && !o.draft_approved_at && supabase) {
        Promise.resolve(
          (privilegedSupabase || supabase)
            .from('ugc_orders')
            .update({ draft_approved_at: new Date().toISOString() })
            .eq('id', o.id)
        ).catch(() => {});
      }

      return {
        ...o,
        status: activeStatus,
        stage: brandStage,
        live_link: resolvedLiveLink,
        deliverable_type: resolvedDeliverableType,
        is_collaboration: isCollab,
        requires_live_link: requiresLiveLink,
        format_category: isCollab ? 'collaboration' : 'ugc_video',
        flow_state: thr?.flow_state || o.flow_state || (activeStatus === 'CONTENT_APPROVED' ? 'CONTENT_APPROVED' : null),
        thread_status: thr?.status || activeStatus,
        thread_flow_state: thr?.flow_state || activeStatus,
        thread_id: thr?.id || o.thread_id || o.id,
        threadId: thr?.id || o.thread_id || o.id,
        content_approved: isContentApproved,
        isApproved: isContentApproved,
        draft_approved_at: o.draft_approved_at || (isContentApproved ? (thr?.updated_at || new Date().toISOString()) : null),
        brief: brief || { title: "UGC Brief", budget: o.creator_payout || 0, deliverable_type: resolvedDeliverableType },
        creator: creator || { name: "Verified UGC Creator" },
        creator_name: creator?.name || "Verified UGC Creator",
        creator_avatar: creator?.avatar || creator?.picture || null,
        revision_notes: resolvedRevisionNotes,
        revision_feedback: resolvedRevisionNotes,
        revision_notes_links: o.revision_notes_links || thr?.revision_notes_links || resolvedRevisionNotes || null,
        decline_notes_links: o.decline_notes_links || thr?.decline_notes_links || null,
        decline_reason: o.decline_reason || thr?.decline_reason || o.decline_notes_links || thr?.decline_notes_links || null,
        // NOTE: brand_status must stay a raw, underscore-style status token (e.g. 'SUBMITTED',
        // 'REVISION_REQUESTED', 'CONTENT_APPROVED') identical to `status` — the frontend's stage classifier
        // (BrandUGCOrders.jsx / BrandInstantUGC.jsx) matches against these exact tokens.
        brand_status: activeStatus
      };
    }));

    return res.json(populated);
  });


  router.get("/ugc/orders/creator", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const includeCancelled = req.query.include_cancelled === 'true';

    let orders: any[] = [];
    if (supabase) {
      try {
        let query = (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .eq('creator_id', user.user_id)
          .order('created_at', { ascending: false });

        if (!includeCancelled) {
          query = query.neq('status', 'CANCELLED');
        }

        const { data } = await query;
        if (data) orders = data;
      } catch (e: any) { logIgnored("ugc_routes:1821", e); }
    }

    const db = getDb();
    const localOrders = (db.ugc_orders || []).filter((o: any) => {
      if (o.creator_id !== user.user_id) return false;
      if (!includeCancelled) {
        const st = (o.status || o.creator_status || '').toUpperCase();
        if (st === 'CANCELLED' || o.brand_id === 'archived_deleted_brand') return false;
      }
      return true;
    });

    const combinedMap = new Map();
    orders.forEach((o: any) => {
      if (!includeCancelled) {
        const st = (o.status || o.creator_status || '').toUpperCase();
        if (st === 'CANCELLED' || o.brand_id === 'archived_deleted_brand') return;
      }
      combinedMap.set(o.id, o);
    });

    localOrders.forEach((o: any) => {
      combinedMap.set(o.id, mergeOrderRecords(combinedMap.get(o.id), o));
    });
    let finalOrders = Array.from(combinedMap.values());
    if (!includeCancelled) {
      finalOrders = finalOrders.filter((o: any) => {
        const st = (o.status || o.creator_status || '').toUpperCase();
        return st !== 'CANCELLED' && o.brand_id !== 'archived_deleted_brand';
      });
    }

    const refs = await prefetchOrderRefs(finalOrders);
    const limitThreadLoad = makeLimiter(6);
    const populated = await Promise.all(finalOrders.map(async (o: any) => {
      let brief = null;
      if (supabase && o.brief_id) {
        try {
          const b = refs.ready
            ? (refs.briefs.get(o.brief_id) || null)
            : (await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', o.brief_id).maybeSingle()).data;
          if (b) brief = b;
        } catch (e) { logIgnored("ugc_routes:1865", e); }
      }
      if (!brief) {
        brief = (db.ugc_briefs || []).find((b: any) => b.id === o.brief_id);
      }
      if (brief) {
        const [enrichedBrief] = await enrichBriefsWithBrandProfiles([brief]);
        if (enrichedBrief) brief = enrichedBrief;
      }
      let brand = null;
      if (supabase && o.brand_id) {
        try {
          const { data: br } = await (privilegedSupabase || supabase).from('brand_profiles').select('*').eq('user_id', o.brand_id).maybeSingle();
          if (br) brand = br;
        } catch (e) { logIgnored("ugc_routes:1879", e); }
      }

      // Same thread + chat timeline the brand list reads, so both sides of one order can never
      // report different stages.
      const { thr, messages: threadMessages } = await limitThreadLoad(() => loadUgcThreadContext(o, db));

      let resolvedRevisionNotes = o.revision_notes || o.revision_feedback || null;
      if (!resolvedRevisionNotes && typeof o.creator_notes === 'string' && o.creator_notes.includes('Revision feedback:')) {
        resolvedRevisionNotes = o.creator_notes.replace(/^Revision feedback:\s*/i, '').trim();
      }
      if (!resolvedRevisionNotes && (thr?.revision_notes || thr?.revision_feedback)) {
        resolvedRevisionNotes = thr.revision_notes || thr.revision_feedback;
      }

      const resolvedLiveLink = o.live_link || (Array.isArray(o.live_links) ? o.live_links[0] : o.live_links) || thr?.live_link || (Array.isArray(thr?.live_links) ? thr?.live_links[0] : thr?.live_links) || null;
      const resolvedDeliverableType = o.deliverable_type || brief?.deliverable_type || 'collaboration_reel';
      const isCollab = o.is_collaboration !== undefined
        ? Boolean(o.is_collaboration)
        : (brief?.is_collaboration !== undefined
          ? Boolean(brief.is_collaboration)
          : isCollaborationDeliverable(resolvedDeliverableType));
      const requiresLiveLink = o.requires_live_link !== undefined
        ? Boolean(o.requires_live_link)
        : (brief?.requires_live_link !== undefined
          ? Boolean(brief.requires_live_link)
          : isCollab);

      // Same resolver the brand list uses. Before this, the creator's copy of the chain also
      // had no branch for 'AWAITING_LIVE_LINK', so after the brand approved the draft the
      // creator's Manage Orders never asked for the live post link — the chat did, and nothing
      // else in the app agreed with it.
      const resolved = resolveUgcStage({
        order: { ...o, live_link: resolvedLiveLink },
        thread: thr,
        messages: threadMessages,
        requiresLiveLink
      });

      const isCompleted = resolved.isCompleted;
      const finalStatus = resolved.status;
      const isContentApproved = resolved.isContentApproved;
      const creatorStage = resolved.creatorStage;
      const finalPaymentStatus = isCompleted ? 'RELEASED' : (o.payment_status || 'PENDING');
      const bLogo = brief?.brand_logo || brand?.logo || null;

      if (isContentApproved && !o.draft_approved_at && supabase) {
        Promise.resolve(
          (privilegedSupabase || supabase)
            .from('ugc_orders')
            .update({ draft_approved_at: new Date().toISOString() })
            .eq('id', o.id)
        ).catch(() => {});
      }

      return {
        ...o,
        status: finalStatus,
        payment_status: finalPaymentStatus,
        creator_status: isCompleted ? 'COMPLETED' : finalStatus,
        stage: creatorStage,
        content_approved: isContentApproved,
        isApproved: isContentApproved,
        draft_approved_at: o.draft_approved_at || (isContentApproved ? (thr?.updated_at || new Date().toISOString()) : null),
        live_link: resolvedLiveLink,
        deliverable_type: resolvedDeliverableType,
        is_collaboration: isCollab,
        requires_live_link: requiresLiveLink,
        format_category: isCollab ? 'collaboration' : 'ugc_video',
        thread_status: thr?.status || finalStatus,
        thread_flow_state: thr?.flow_state || finalStatus,
        thread_id: thr?.id || o.thread_id || o.id,
        threadId: thr?.id || o.thread_id || o.id,
        revision_notes: resolvedRevisionNotes,
        revision_feedback: resolvedRevisionNotes,
        revision_notes_links: o.revision_notes_links || thr?.revision_notes_links || resolvedRevisionNotes || null,
        decline_notes_links: o.decline_notes_links || thr?.decline_notes_links || null,
        decline_reason: o.decline_reason || thr?.decline_reason || o.decline_notes_links || thr?.decline_notes_links || null,
        brief: brief || { title: "UGC Brief", budget: o.creator_payout || 0, brand_logo: bLogo },
        brand: brand || { company_name: brief?.brand_name || "Brand Partner", logo: bLogo },
        brand_name: brand?.company_name || brief?.brand_name || "Brand Partner",
        brand_logo: bLogo
      };
    }));

    return res.json(populated);
  });


  router.get(["/ugc/orders/:id", "/ugc/order/:id"], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    let order: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${id},brief_id.eq.${id}`)
          .maybeSingle();
        if (data) order = data;
      } catch (e: any) { logIgnored("ugc_routes:1980", e); }
    }
    const db = getDb();
    const localOrder = (db.ugc_orders || []).find((o: any) => o.id === id || o.brief_id === id);
    if (!order && localOrder) order = localOrder;
    else if (order && localOrder) order = { ...localOrder, ...order };

    if (!order) return res.status(404).json({ error: "Order not found" });
    // The order's brand and creator only. Any signed-in user could read any order, video URL
    // and payout included.
    if (!partyRole(user, null, order)) return ugcForbid(res, 'party');

    let brief = (db.ugc_briefs || []).find((b: any) => b.id === order.brief_id);
    const resolvedDeliverableType = order.deliverable_type || brief?.deliverable_type || 'collaboration_reel';
    const isCollab = order.is_collaboration !== undefined
      ? Boolean(order.is_collaboration)
      : (brief?.is_collaboration !== undefined
        ? Boolean(brief.is_collaboration)
        : isCollaborationDeliverable(resolvedDeliverableType));
    const requiresLiveLink = order.requires_live_link !== undefined
      ? Boolean(order.requires_live_link)
      : (brief?.requires_live_link !== undefined
        ? Boolean(brief.requires_live_link)
        : isCollab);

    // The list routes return the resolved stage; this single-order read did not, so a screen that
    // opened one order derived its own and could disagree with the list.
    let stage: any = null;
    try { stage = resolveUgcStage({ order, thread: null, messages: [], requiresLiveLink } as any); } catch (e: any) { logIgnored("ugc_routes:2008", e); }
    return res.json({
      ...order,
      deliverable_type: resolvedDeliverableType,
      is_collaboration: isCollab,
      requires_live_link: requiresLiveLink,
      format_category: isCollab ? 'collaboration' : 'ugc_video',
      ugc_stage: stage
    });
  });


  const { reserveBriefSlot, finishBriefClaim, releaseBriefSlot } = createUgcSlots({
    getClient: () => privilegedSupabase || supabase,
    getDb,
    saveDb
  });

  const handleUgcBriefClaim = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });

    const { brief_id, signature } = req.body;
    if (!brief_id) return res.status(400).json({ error: "brief_id is required" });

    let brief: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', brief_id).maybeSingle();
        if (data) brief = data;
      } catch (e) { logIgnored("ugc_routes:2039", e); }
    }
    const db = getDb();
    if (!brief) {
      brief = (db.ugc_briefs || []).find((b: any) => b.id === brief_id);
    }
    if (!brief) return res.status(404).json({ error: "Brief not found" });

    if (brief.brand_id === user.user_id) {
      return res.status(400).json({ error: "You cannot claim your own brief." });
    }
    // Creators claim; brands do not (a brand could claim another brand's brief as the creator).
    if (String(user.role || '').toLowerCase() !== 'creator') {
      return res.status(403).json({ error: "Only creator accounts can claim UGC briefs." });
    }
    // One claim per creator per brief. A three-slot brief could be claimed three times by the
    // same creator — three payouts for one piece of work.
    {
      let alreadyClaimed = (db.ugc_orders || []).some((o: any) =>
        o.brief_id === brief.id && o.creator_id === user.user_id && String(o.status || '').toUpperCase() !== 'CANCELLED');
      if (!alreadyClaimed && supabase) {
        try {
          const { data: mine } = await (privilegedSupabase || supabase)
            .from('ugc_orders')
            .select('id, status')
            .eq('brief_id', brief.id)
            .eq('creator_id', user.user_id);
          alreadyClaimed = (mine || []).some((o: any) => String(o.status || '').toUpperCase() !== 'CANCELLED');
        } catch (e: any) { logIgnored("ugc_routes:2066", e); }
      }
      if (alreadyClaimed) {
        return res.status(409).json({ error: "You have already claimed this brief.", code: 'ALREADY_CLAIMED' });
      }
    }

    const maxC = Number(brief.max_creators) || 1;
    if (brief.status !== 'OPEN' && brief.status !== 'CLAIMED') {
      return res.status(400).json({ error: "This brief is not open for claims." });
    }
    // Reserve the slot FIRST, atomically. This read the count, checked it, and wrote count+1
    // after the order insert — two creators claiming at once both saw the old count, both
    // passed, and a one-slot brief got two orders (two payouts). The reservation below is a
    // compare-and-set on claimed_count, and it is released again if the order cannot be saved.
    // Claiming signs the creator's side of the agreement (agreement_signed_creator: true), so it
    // needs the verified email OTP like every other signature (backend/signTokens.ts). Checked
    // before the slot is reserved, so a missing code never holds a slot.
    if (user.role !== 'admin' && !(await consumeSignToken(user.user_id, req.body?.sign_token))) {
      return signOtpRequired(res);
    }
    const slot = await reserveBriefSlot(brief, user.user_id);
    if (!slot.ok) {
      return res.status(slot.status || 400).json({ error: slot.error, code: slot.code });
    }
    const claimedC = slot.previousCount;

    const orderId = `ugcord_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`;
    const nowIso = getIsoNow();
    const payout = Number(brief.budget) || 1;

    // Detect if this is a Collaboration (requires live link) vs Normal UGC (draft approval only)
    const deliverableType = brief.deliverable_type || brief.format || brief.format_category || (brief.is_raw ? "ugc_video_raw" : (brief.is_collaboration ? "collaboration_reel" : "ugc_video_edited"));
    const isCollab = brief.is_collaboration !== undefined
      ? Boolean(brief.is_collaboration)
      : (brief.requires_live_link !== undefined
        ? Boolean(brief.requires_live_link)
        : isCollaborationDeliverable(deliverableType));
    const requiresLiveLink = brief.requires_live_link !== undefined
      ? Boolean(brief.requires_live_link)
      : isCollab;

    const newOrder = {
      id: orderId,
      brief_id: brief.id,
      brand_id: brief.brand_id,
      creator_id: user.user_id,
      status: 'ACCEPTED',
      deliverable_type: deliverableType,
      is_collaboration: isCollab,
      requires_live_link: requiresLiveLink,
      format_category: isCollab ? 'collaboration' : 'ugc_video',
      creator_payout: payout,
      agreed_amount: payout,
      escrow_amount: payout,
      escrow_hold: true,
      escrow_held_at: nowIso,
      payment_status: 'ESCROW_HELD',
      agreement_signed_creator: true,
      internal_deadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      revision_count: 5,
      revisions_used: 0,
      created_at: nowIso
    };

    if (supabase) {
      try {
        const supaPayload = {
          id: orderId,
          brief_id: brief.id,
          brand_id: brief.brand_id,
          creator_id: user.user_id,
          status: 'ACCEPTED',
          creator_payout: payout,
          agreed_amount: payout,
          escrow_amount: payout,
          escrow_hold: true,
          escrow_held_at: nowIso,
          payment_status: 'ESCROW_HELD',
          agreement_signed_creator: true,
          internal_deadline: newOrder.internal_deadline,
          revision_count: 5,
          revisions_used: 0,
          created_at: nowIso,
          // Carried from the brief at claim time. Without these the order has no record of
          // what kind of deliverable it is, and the approval path has to guess — which it
          // did, wrongly, by defaulting to "collaboration" and demanding a live link.
          deliverable_type: deliverableType,
          is_collaboration: isCollab,
          requires_live_link: requiresLiveLink
        };
        const { error: insErr } = await (privilegedSupabase || supabase).from('ugc_orders').insert(supaPayload);
        // A failed insert used to fall through: the order existed only locally and the creator
        // was told the claim succeeded.
        if (insErr) {
          console.error("[POST /ugc/orders/claim] order insert failed:", insErr.message || insErr);
          await releaseBriefSlot(brief.id, user.user_id);
          return res.status(500).json({ error: "Could not claim this brief right now. Please try again." });
        }
      } catch(e) {
        console.error("[POST /ugc/orders/claim] Supabase error:", e);
        await releaseBriefSlot(brief.id, user.user_id);
        return res.status(500).json({ error: "Could not claim this brief right now. Please try again." });
      }
    }

    if (!db.ugc_orders) db.ugc_orders = [];
    db.ugc_orders.unshift(newOrder);
    saveDb(db);
    finishBriefClaim(brief.id, user.user_id);

    // Create dedicated UGC chat thread immediately
    await ensureUGCChatThread(newOrder, brief, user, req.app.get("io"));

    return res.json({ ok: true, order_id: orderId, thread_id: orderId, order: newOrder, message: "Brief successfully claimed!" });
  };
  router.post("/ugc/orders/claim", handleUgcBriefClaim);


  router.post("/ugc/orders/:id/sign", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const { signature } = req.body;

    // Anyone could call this on any order, and it rewrote status to ACCEPTED — a COMPLETED
    // order went back to the start. Only the order's creator signs, and signing never moves an
    // order that is already past acceptance.
    {
      let target: any = (getDb().ugc_orders || []).find((o: any) => o.id === id) || null;
      if (supabase) {
        try {
          const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('id', id).maybeSingle();
          if (data) target = { ...(target || {}), ...data };
        } catch (e: any) { logIgnored("ugc_routes:2200", e); }
      }
      if (!target) return res.status(404).json({ error: "Order not found" });
      const role = partyRole(user, null, target);
      if (role !== 'creator' && role !== 'admin') return ugcForbid(res, 'creator');
      const st = orderStatus(target);
      if (st && !['ACCEPTED', 'PENDING', 'CLAIMED', 'AWAITING_SIGNATURE'].includes(st)) {
        return res.json({ ok: true, already_signed: true, order_id: id, thread_id: id, message: "Agreement already signed" });
      }
    }

    // The email OTP must have been verified on the server (backend/signTokens.ts).
    if (user.role !== 'admin' && !(await consumeSignToken(user.user_id, req.body?.sign_token))) {
      return signOtpRequired(res);
    }

    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('ugc_orders').update({
          agreement_signed_creator: true,
          status: 'ACCEPTED'
        }).eq('id', id);
      } catch (e) { logIgnored("ugc_routes:2223", e); }
    }
    const db = getDb();
    const order = (db.ugc_orders || []).find((o: any) => o.id === id);
    if (order) {
      order.agreement_signed_creator = true;
      order.status = 'ACCEPTED';
      saveDb(db);
    }

    // Ensure dedicated chat thread is created on signing
    let fullOrder = order;
    if (!fullOrder && supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('id', id).maybeSingle();
        if (data) fullOrder = data;
      } catch (e: any) { logIgnored("ugc_routes:2238", e); }
    }
    if (fullOrder) {
      await ensureUGCChatThread(fullOrder, null, user, req.app.get("io"));
    }

    return res.json({ ok: true, order_id: id, thread_id: id, message: "Agreement signed" });
  });


  router.get("/ugc/earnings", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let orders: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .eq('creator_id', user.user_id)
          .eq('status', 'COMPLETED');
        if (data) orders = data;
      } catch (e) { logIgnored("ugc_routes:2262", e); }
    }
    const db = getDb();
    const localOrders = (db.ugc_orders || []).filter((o: any) => o.creator_id === user.user_id && o.status === 'COMPLETED');
    const combinedMap = new Map();
    orders.forEach((o: any) => combinedMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      combinedMap.set(o.id, mergeOrderRecords(combinedMap.get(o.id), o));
    });
    const finalOrders = Array.from(combinedMap.values());

    // The earnings page showed creator_payout (the GROSS order amount) as what the creator
    // earns. The platform fee is taken at release and written to the transaction row — attach
    // those amounts so the page shows the real net. Orders with no release row yet get the
    // same fee calculation the release will use.
    const ids = finalOrders.map((o: any) => o.id).filter(Boolean);
    const txByOrder = new Map<string, any>();
    const isRefundRow = (t: any) => Boolean(t?.refund_amount || t?.refund_status) || String(t?.status || '').toUpperCase() === 'REFUNDED';
    if (supabase && ids.length) {
      try {
        const { data: txs } = await (privilegedSupabase || supabase)
          .from('transactions')
          .select('ugc_order_id, gross_amount, platform_fee_amount, creator_net_amount, payout_status, refund_amount, refund_status, status')
          .in('ugc_order_id', ids);
        (txs || []).filter((t: any) => !isRefundRow(t) && t.creator_net_amount != null).forEach((t: any) => txByOrder.set(t.ugc_order_id, t));
      } catch (e: any) {
        console.warn("[ugc/earnings] transactions lookup failed:", e?.message || e);
      }
    }
    (db.transactions || [])
      .filter((t: any) => ids.includes(t.ugc_order_id) && !isRefundRow(t) && t.creator_net_amount != null && !txByOrder.has(t.ugc_order_id))
      .forEach((t: any) => txByOrder.set(t.ugc_order_id, t));

    const feeByGross = new Map<number, Promise<any>>(); // one fee lookup per distinct amount
    const withNet = await Promise.all(finalOrders.map(async (o: any) => {
      const gross = Number(o.escrow_amount ?? o.creator_payout ?? o.agreed_amount ?? 0) || 0;
      const tx = txByOrder.get(o.id);
      if (tx) {
        return {
          ...o,
          gross_amount: Number(tx.gross_amount ?? gross) || gross,
          platform_fee_amount: Number(tx.platform_fee_amount) || 0,
          creator_net_amount: Number(tx.creator_net_amount) || 0
        };
      }
      let fee = Math.round(gross * 15) / 100;
      try {
        if (!feeByGross.has(gross)) feeByGross.set(gross, calculatePlatformFee(gross, (privilegedSupabase || supabase)).catch(() => null));
        const calc: any = await feeByGross.get(gross);
        if (calc && calc.creatorNet != null) {
          return { ...o, gross_amount: gross, platform_fee_amount: Number(calc.platformFee) || 0, creator_net_amount: Number(calc.creatorNet) || 0 };
        }
      } catch (e: any) { logIgnored("ugc_routes:2313", e); }
      return { ...o, gross_amount: gross, platform_fee_amount: fee, creator_net_amount: Math.max(0, gross - fee) };
    }));

    return res.json(withNet);
  });


  router.get("/ugc/showcase", async (req, res) => {
    let briefs: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').limit(12);
        if (data) briefs = data;
      } catch (e) { logIgnored("ugc_routes:2328", e); }
    }
    const db = getDb();
    if (briefs.length === 0) {
      briefs = (db.ugc_briefs || []).slice(0, 12);
    }
    return res.json(briefs);
  });


  router.get("/admin/ugc/orders", async (req, res) => {
    // There was no authentication here at all: anyone on the internet could list every UGC
    // order. The /admin prefix is not protected by any middleware.
    const adminUser = await parseAuthUser(req);
    if (!adminUser) return res.status(401).json({ error: "Unauthorized" });
    if (!isAdmin(adminUser)) return res.status(403).json({ error: "Admins only" });
    let orders: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').order('created_at', { ascending: false });
        if (data) orders = data;
      } catch (e) { logIgnored("ugc_routes:2349", e); }
    }
    const db = getDb();
    const localOrders = db.ugc_orders || [];
    const combinedMap = new Map();
    orders.forEach((o: any) => combinedMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      combinedMap.set(o.id, mergeOrderRecords(combinedMap.get(o.id), o));
    });
    return res.json(Array.from(combinedMap.values()));
  });


  router.post("/admin/ugc/orders/:id/team-upload", async (req, res) => {
    // Unauthenticated before: anyone could replace any order's video and mark it SUBMITTED.
    const adminUser = await parseAuthUser(req);
    if (!adminUser) return res.status(401).json({ error: "Unauthorized" });
    if (!isAdmin(adminUser)) return res.status(403).json({ error: "Admins only" });
    const { id } = req.params;
    if (!req.body?.videoUrl) return res.status(400).json({ error: "videoUrl is required" });
    const { videoUrl, notes } = req.body;
    const nowIso = getIsoNow();
    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('ugc_orders').update({
          video_url: videoUrl,
          creator_notes: notes || "Team SLA Upload",
          status: 'SUBMITTED',
          delivered_at: nowIso
        }).eq('id', id);
      } catch (e) { logIgnored("ugc_routes:2379", e); }
    }
    const db = getDb();
    const order = (db.ugc_orders || []).find((o: any) => o.id === id);
    if (order) {
      order.video_url = videoUrl;
      order.creator_notes = notes || "Team SLA Upload";
      order.status = 'SUBMITTED';
      order.delivered_at = nowIso;
      saveDb(db);
    }
    return res.json({ ok: true, message: "Team upload saved" });
  });


  router.get("/ugc-orders", async (req, res) => {
    const viewer = await parseAuthUser(req);
    // PUBLIC PREVIEW. Logged-out visitors see the open briefs (title, brand, budget, format) so
    // the public "Live UGC Orders" page works — it showed "Failed to load UGC Orders" because
    // this answered 401. Nothing else is exposed: no orders, creators or videos. Claiming,
    // posting and every detail stay behind sign-in.
    if (!viewer) {
      let open: any[] = [];
      if (supabase) {
        try {
          const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('status', 'OPEN').order('created_at', { ascending: false }).limit(100);
          if (data) open = data;
        } catch (e: any) { logIgnored("ugc_routes:2405", e); }
      }
      const localOpen = (getDb().ugc_briefs || []).filter((b: any) => (b.status || 'OPEN') === 'OPEN');
      localOpen.forEach((b: any) => { if (!open.some((x: any) => x.id === b.id)) open.push(b); });
      open = open.filter((b: any) => (Number(b.claimed_count) || 0) < (Number(b.max_creators) || 1));
      return res.json(open.map(publicBrief));
    }

    const db = getDb();
    let briefs: any[] = [];
    let orders: any[] = [];
    let brands: any[] = [];
    let creators: any[] = [];

    if (supabase) {
      try {
        const [rawBriefs, rawOrders, rawBrands, rawCreators] = await Promise.all([
          (privilegedSupabase || supabase).from('ugc_briefs').select('*'),
          (privilegedSupabase || supabase).from('ugc_orders').select('*'),
          (privilegedSupabase || supabase).from('brand_profiles').select('*'),
          (privilegedSupabase || supabase).from('users').select('user_id, name').eq('role', 'creator')
        ]);
        if (rawBriefs.data) briefs = rawBriefs.data;
        if (rawOrders.data) orders = rawOrders.data;
        if (rawBrands.data) brands = rawBrands.data;
        if (rawCreators.data) creators = rawCreators.data;
      } catch (e: any) {
        console.warn("[ugc-orders] Supabase fetch error:", e);
      }
    }

    // Merge with local db briefs
    const briefMap = new Map(briefs.map((b: any) => [b.id, b]));
    (db.ugc_briefs || []).forEach((lb: any) => {
      if (!briefMap.has(lb.id)) {
        briefMap.set(lb.id, lb);
        briefs.push(lb);
      }
    });

    // Map orders by brief_id and id, prioritizing newest and local updates
    const orderMap = new Map<string, any>();
    orders.forEach((o: any) => {
      if (o.brief_id) orderMap.set(o.brief_id, o);
      if (o.id) orderMap.set(o.id, o);
    });
    (db.ugc_orders || []).forEach((lo: any) => {
      if (lo.brief_id) {
        const existing = orderMap.get(lo.brief_id);
        orderMap.set(lo.brief_id, existing ? { ...existing, ...lo } : lo);
      }
      if (lo.id) {
        const existing = orderMap.get(lo.id);
        orderMap.set(lo.id, existing ? { ...existing, ...lo } : lo);
      }
    });

    const brandMap = new Map(brands.map((b: any) => [b.user_id, b]));
    const creatorMap = new Map(creators.map((c: any) => [c.user_id, c.name]));
    const viewerBrand = viewer.parent_brand_id || viewer.user_id;
    const canSeeVideo = (brief: any, order: any) =>
      isAdmin(viewer) || brief?.brand_id === viewerBrand || (order && order.creator_id === viewer.user_id);

    const processed = briefs.map((brief: any) => {
      const order = orderMap.get(brief.id) as any;
      const brand = brandMap.get(brief.brand_id) as any;
      const creatorName = order ? (creatorMap.get(order.creator_id) || order.accepted_by_creator_name) : null;
      
      const rawStatus = order?.status || "Open";
      const normalizedStatus = order
        ? (order.in_house_assigned && (rawStatus === 'IN_HOUSE_ASSIGNED' || rawStatus === 'in_house_backup')
            ? 'in_house_backup'
            : rawStatus.toLowerCase())
        : "open";

      return {
        order_id: brief.id,
        brief_id: brief.id,
        brand_user_id: brief.brand_id,
        brand_name: brand?.company_name || brief.brand_name || "Unknown Brand",
        brand_logo: brand?.logo_url || null,
        product_name: brief.product_name || brief.title || "UGC Product",
        instructions: brief.detailed_requirements || brief.product_description || "",
        category: brief.deliverable_type || "Fashion",
        video_length: brief.video_duration || "30s",
        ref_link: brief.sample_content_url || null,
        budget: brief.budget || 0,
        amount: brief.budget || 0,
        creator_name: creatorName || "Unknown Creator",
        accepted_by_creator_id: order?.creator_id || order?.accepted_by_creator_id || null,
        accepted_by_creator_name: creatorName || "Vetted Creator",
        // Delivered videos go to the order's own brand, its creator and admins. Every signed-in
        // user used to receive every brand's delivered (unwatermarked) video URL here.
        submitted_video_url: canSeeVideo(brief, order) ? (order?.video_url || null) : null,
        video_url: canSeeVideo(brief, order) ? (order?.video_url || null) : null,
        status: normalizedStatus,
        raw_status: rawStatus,
        in_house_assigned: !!order?.in_house_assigned,
        date: brief.created_at || new Date().toISOString(),
        content_type: brief.content_type || brief.deliverable_type || "Video",
        title: brief.title || brief.product_name || "UGC Campaign"
      };
    });
    return res.json(processed);
  });


  router.post("/ugc-orders/:orderId/accept", async (req, res) => {
    const viewer = await parseAuthUser(req);
    // Legacy second claim path. It accepted anonymous callers and brands, with none of the
    // claim rules. Now: signed-in creators (or admins) only, and never over someone else's order.
    if (!viewer) return res.status(401).json({ error: "Sign in as a creator to accept this order." });
    if (!['creator', 'admin'].includes(String(viewer.role || '').toLowerCase())) {
      return res.status(403).json({ error: "Only creator accounts can accept UGC orders." });
    }
    const { orderId } = req.params;
    const nowIso = getIsoNow();

    const db = getDb();
    let order: any = (db.ugc_orders || []).find((o: any) => o.id === orderId || o.brief_id === orderId);
    if (order && order.creator_id && order.creator_id !== viewer.user_id && !isAdmin(viewer)) {
      return res.status(409).json({ error: "This order has already been claimed by another creator." });
    }
    if (order && isUgcOrderClosed(order)) {
      return res.status(409).json({ error: "This order is already closed." });
    }
    let brief: any = (db.ugc_briefs || []).find((b: any) => b.id === orderId || (order && b.id === order.brief_id));

    if (supabase) {
      try {
        if (!order) {
          const { data: supaOrder } = await (privilegedSupabase || supabase)
            .from('ugc_orders')
            .select('*')
            .or(`id.eq.${orderId},brief_id.eq.${orderId}`)
            .maybeSingle();
          if (supaOrder) order = supaOrder;
        }
        if (!brief) {
          const targetBriefId = order?.brief_id || orderId;
          const { data: supaBrief } = await (privilegedSupabase || supabase)
            .from('ugc_briefs')
            .select('*')
            .eq('id', targetBriefId)
            .maybeSingle();
          if (supaBrief) brief = supaBrief;
        }
      } catch (e) {
        console.warn("[POST /ugc-orders/:orderId/accept] Supabase lookup error:", e);
      }
    }

    // A brief with no order yet is a claim: send it through the one claim path, which applies
    // every rule (creators only, one per creator, capacity, atomic slot). This route used to
    // create the order itself and skip all of them.
    if (!order && brief) {
      req.body = { ...(req.body || {}), brief_id: brief.id };
      return handleUgcBriefClaim(req, res);
    }
    // Neither exists: this used to invent a ₹50,000 order under a placeholder brand.
    if (!order) {
      return res.status(404).json({ error: "This order or brief no longer exists." });
    }

    const candidateCreatorId = viewer?.user_id;
    const briefBrandId = brief?.brand_id || order?.brand_id;
    if (!candidateCreatorId || candidateCreatorId === briefBrandId) {
      return res.status(400).json({ error: "You cannot accept your own order." });
    }
    const assignedCreatorId = candidateCreatorId;
    const creatorName = viewer?.name || 'Creator';

    // Already this creator's order: nothing to accept. Re-running the update below used to put
    // a delivered or in-review order back to ACCEPTED.
    if (order.creator_id && order.creator_id === assignedCreatorId) {
      return res.json({ ok: true, success: true, order_id: order.id, brief_id: order.brief_id, status: order.status, order, message: "This order is already yours." });
    }

    if (order) {
      // An unassigned order: this creator takes it.
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('ugc_orders').update({
            creator_id: assignedCreatorId,
            status: 'ACCEPTED',
            agreement_signed_creator: true
          }).eq('id', order.id).is('creator_id', null); // only if still unassigned
        } catch (e) {
          console.warn("[POST /ugc-orders/:orderId/accept] Supabase update error:", e);
        }
      }

      order.creator_id = assignedCreatorId;
      order.status = 'ACCEPTED';
      order.in_house_assigned = true;
      order.agreement_signed_creator = true;
      order.accepted_at = nowIso;
      order.accepted_by_creator_id = viewer?.user_id || assignedCreatorId;
      order.accepted_by_creator_name = creatorName;

      // Update local db
      if (!db.ugc_orders) db.ugc_orders = [];
      const locIdx = db.ugc_orders.findIndex((o: any) => o.id === order.id || o.brief_id === order.brief_id);
      if (locIdx >= 0) {
        db.ugc_orders[locIdx] = { ...db.ugc_orders[locIdx], ...order };
      } else {
        db.ugc_orders.unshift(order);
      }
      saveDb(db);
    }

    return res.json({
      ok: true,
      success: true,
      order_id: order?.id || orderId,
      brief_id: brief?.id || order?.brief_id || orderId,
      status: 'ACCEPTED',
      in_house_assigned: true,
      order,
      message: "Order claimed/accepted for in-house handling"
    });
  });


  router.post("/ugc-orders/:orderId/submit", async (req, res) => {
    const viewer = await parseAuthUser(req);
    // Unguarded before: any caller could replace any order's video and mark it SUBMITTED.
    if (!viewer) return res.status(401).json({ error: "Unauthorized" });
    const { orderId } = req.params;
    const { video_url, videoUrl, notes } = req.body || {};
    const url = (video_url || videoUrl || "").toString().trim();

    if (!url) {
      return res.status(400).json({ error: "video_url is required" });
    }

    const nowIso = getIsoNow();
    const db = getDb();
    let order: any = (db.ugc_orders || []).find((o: any) => o.id === orderId || o.brief_id === orderId);
    {
      let check: any = order;
      if (!check && supabase) {
        try {
          const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').or(`id.eq.${orderId},brief_id.eq.${orderId}`).limit(1);
          if (Array.isArray(data) && data[0]) check = data[0];
        } catch (e: any) { logIgnored("ugc_routes:2650", e); }
      }
      if (!check) return res.status(404).json({ error: "Order not found" });
      const role = partyRole(viewer, null, check);
      if (role !== 'creator' && role !== 'admin') return ugcForbid(res, 'creator');
      if (isUgcOrderClosed(check)) return res.status(409).json({ error: "This order is already closed." });
    }
    let brief: any = (db.ugc_briefs || []).find((b: any) => b.id === orderId || (order && b.id === order.brief_id));

    if (supabase) {
      try {
        if (!order) {
          const { data: supaOrder } = await (privilegedSupabase || supabase)
            .from('ugc_orders')
            .select('*')
            .or(`id.eq.${orderId},brief_id.eq.${orderId}`)
            .maybeSingle();
          if (supaOrder) order = supaOrder;
        }
        if (!brief) {
          const targetBriefId = order?.brief_id || orderId;
          const { data: supaBrief } = await (privilegedSupabase || supabase)
            .from('ugc_briefs')
            .select('*')
            .eq('id', targetBriefId)
            .maybeSingle();
          if (supaBrief) brief = supaBrief;
        }
      } catch (e) {
        console.warn("[POST /ugc-orders/:orderId/submit] Supabase lookup error:", e);
      }
    }

    // Placeholder-order branches removed: the check above already 404s when no order exists,
    // and they invented a ₹50,000 order under a placeholder brand and creator.
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order) {
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('ugc_orders').update({
            video_url: url,
            status: 'SUBMITTED',
            delivered_at: nowIso,
            creator_notes: notes || order.creator_notes || "Deliverable submitted"
          }).eq('id', order.id);
        } catch (e) {
          console.warn("[POST /ugc-orders/:orderId/submit] Supabase update error:", e);
        }
      }

      order.video_url = url;
      order.status = 'SUBMITTED';
      order.delivered_at = nowIso;
      order.creator_notes = notes || order.creator_notes || "Deliverable submitted";

      if (!db.ugc_orders) db.ugc_orders = [];
      const locIdx = db.ugc_orders.findIndex((o: any) => o.id === order.id || o.brief_id === order.brief_id);
      if (locIdx >= 0) {
        db.ugc_orders[locIdx] = { ...db.ugc_orders[locIdx], ...order };
      } else {
        db.ugc_orders.unshift(order);
      }
      saveDb(db);
    }

    return res.json({
      ok: true,
      success: true,
      order_id: order?.id || orderId,
      brief_id: brief?.id || order?.brief_id || orderId,
      status: 'SUBMITTED',
      video_url: url,
      order,
      message: "Deliverable video submitted successfully"
    });
  });

}
