import { Router, type IRouter } from "express";
import { storage } from "../storage";

const router: IRouter = Router();

router.get("/stats", async (_req, res) => {
  try {
    const stats = await storage.getProtocolStats();
    res.json({
      tvlUsd: stats.tvlUsd,
      tvlTrend: stats.tvlTrend,
      activeVaults: stats.activeVaults,
      maxVaults: stats.maxVaults,
      nftKeysMinted: stats.nftKeysMinted,
      nftUtilizationPct: stats.nftUtilizationPct,
      syncLatencyMs: stats.syncLatencyMs,
      circuitBreakerActive: stats.circuitBreakerActive,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch protocol stats" });
  }
});

router.get("/lockers", async (req, res) => {
  try {
    const tier = req.query.tier ? Number(req.query.tier) : undefined;
    const lockers = tier
      ? await storage.getLockersByTier(tier)
      : await storage.getLockers();

    res.json(lockers.map((l) => ({
      id: l.id,
      externalId: l.externalId,
      tier: l.tier,
      capacity: l.capacity,
      usedSlots: l.usedSlots,
      status: l.status,
      minDepositSol: l.minDepositSol,
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch lockers" });
  }
});

router.get("/nfts", async (req, res) => {
  try {
    const wallet = (req.query.wallet as string) || "8xR...3kL";
    const nfts = await storage.getNftsByWallet(wallet);
    res.json(nfts.map((n) => ({
      id: n.id,
      mint: n.mint,
      name: n.name,
      image: n.image,
      vaultRef: n.vaultRef,
      lockerRef: n.lockerRef,
      isTicket: n.isTicket,
      transferLockDays: n.transferLockDays,
      kycLevel: n.kycLevel,
      eventName: n.eventName,
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch NFTs" });
  }
});

router.get("/events/current", async (_req, res) => {
  try {
    const event = await storage.getCurrentEvent();
    if (!event) {
      return res.status(404).json({ error: "No active event found" });
    }
    res.json({
      id: event.id,
      name: event.name,
      venue: event.venue,
      eventDate: event.eventDate,
      lockerRef: event.lockerRef,
      saleDate: event.saleDate,
      registrationDeadline: event.registrationDeadline,
      tiers: event.tiers.map((t) => ({
        id: t.id,
        tierId: t.tierId,
        label: t.label,
        prefix: t.prefix,
        capacity: t.capacity,
        maxSeats: t.maxSeats,
        basePriceUsd: t.basePriceUsd,
        releaseOffsetHours: t.releaseOffsetHours,
        transferLockDays: t.transferLockDays,
        kycLevel: t.kycLevel,
        discounts: JSON.parse(t.discounts),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

router.post("/swaps", async (req, res) => {
  try {
    const { token, initiatorWallet, offeredNftMint, counterpartyWallet, requestedNftMint, swapType, targetLocker } = req.body;

    if (!token || !initiatorWallet || !offeredNftMint) {
      return res.status(400).json({ error: "token, initiatorWallet, and offeredNftMint are required" });
    }

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const session = await storage.createSwapSession({
      token,
      initiatorWallet,
      offeredNftMint,
      counterpartyWallet: counterpartyWallet ?? null,
      requestedNftMint: requestedNftMint ?? null,
      swapType: swapType ?? "sol-to-sol",
      targetLocker: targetLocker ?? null,
      status: "pending",
      txSignature: null,
      expiresAt,
    });

    res.status(201).json({ id: session.id, token: session.token, status: session.status, expiresAt: session.expiresAt });
  } catch (err) {
    res.status(500).json({ error: "Failed to create swap session" });
  }
});

router.get("/swaps/:token", async (req, res) => {
  try {
    const session = await storage.getSwapSessionByToken(req.params.token);
    if (!session) {
      return res.status(404).json({ error: "Swap session not found" });
    }
    const expired = new Date() > session.expiresAt;
    res.json({
      id: session.id,
      token: session.token,
      status: expired ? "expired" : session.status,
      initiatorWallet: session.initiatorWallet,
      offeredNftMint: session.offeredNftMint,
      swapType: session.swapType,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch swap session" });
  }
});

router.patch("/swaps/:token/confirm", async (req, res) => {
  try {
    const session = await storage.getSwapSessionByToken(req.params.token);
    if (!session) {
      return res.status(404).json({ error: "Swap session not found" });
    }
    if (new Date() > session.expiresAt) {
      return res.status(400).json({ error: "Swap session has expired" });
    }
    const txSig = `${Math.random().toString(36).slice(2, 8)}...${Math.random().toString(36).slice(2, 6)}`;
    const updated = await storage.updateSwapSessionStatus(req.params.token, "complete", txSig);
    res.json({ status: updated?.status, txSignature: updated?.txSignature });
  } catch (err) {
    res.status(500).json({ error: "Failed to confirm swap" });
  }
});

// ── Vault Sessions ──────────────────────────────────────────────────────────

router.get("/sessions/:vaultId", async (req, res) => {
  try {
    const nftMint = req.query.nftMint as string;
    if (!nftMint) return res.status(400).json({ error: "nftMint query param is required" });
    const session = await storage.getActiveVaultSession(req.params.vaultId, nftMint);
    if (!session) return res.status(404).json({ error: "No active session" });
    res.json({
      id: session.id,
      sessionId: session.sessionId,
      vaultId: session.vaultId,
      nftMint: session.nftMint,
      authorizedAddress: session.authorizedAddress,
      label: session.label,
      openedAt: session.openedAt.getTime(),
      expiresAt: session.expiresAt.getTime(),
      status: session.status,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

router.post("/sessions", async (req, res) => {
  try {
    const { vaultId, nftMint, authorizedAddress, label, durationMs } = req.body;
    if (!vaultId || !nftMint || !durationMs) {
      return res.status(400).json({ error: "vaultId, nftMint, and durationMs are required" });
    }
    const openedAt = new Date();
    const expiresAt = new Date(openedAt.getTime() + Number(durationMs));
    const sessionId = "SES-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const session = await storage.createVaultSession({
      vaultId,
      nftMint,
      sessionId,
      authorizedAddress: authorizedAddress || "Any holder",
      label: label || "General session",
      expiresAt,
      status: "open",
      closedAt: null,
    });
    res.status(201).json({
      id: session.id,
      sessionId: session.sessionId,
      vaultId: session.vaultId,
      nftMint: session.nftMint,
      authorizedAddress: session.authorizedAddress,
      label: session.label,
      openedAt: session.openedAt.getTime(),
      expiresAt: session.expiresAt.getTime(),
      status: session.status,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create session" });
  }
});

router.delete("/sessions/:vaultId", async (req, res) => {
  try {
    const nftMint = req.query.nftMint as string;
    if (!nftMint) return res.status(400).json({ error: "nftMint query param is required" });
    const session = await storage.closeVaultSession(req.params.vaultId, nftMint);
    if (!session) return res.status(404).json({ error: "No active session to close" });
    res.json({ status: "closed", sessionId: session.sessionId });
  } catch (err) {
    res.status(500).json({ error: "Failed to close session" });
  }
});

// ── Session History (owner-gated) ────────────────────────────────────────────

router.get("/sessions/:vaultId/history", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const wallet = req.query.wallet as string | undefined;
    if (!wallet) {
      return res.status(400).json({ error: "wallet query parameter is required" });
    }
    const entries = await storage.getSessionHistory(vaultId, wallet);
    if (entries === null) {
      return res.status(403).json({ error: "Access denied: wallet does not own this vault" });
    }
    res.json(entries.map(e => ({
      id: e.id,
      sessionId: e.sessionId,
      label: e.label,
      authorizedAddress: e.authorizedAddress,
      openedAt: e.openedAt,
      closedAt: e.closedAt,
      durationMs: e.durationMs,
      shareWithProtocol: e.shareWithProtocol,
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch session history" });
  }
});

router.post("/sessions/:vaultId/history", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { wallet, sessionId, label, authorizedAddress, openedAt, closedAt, durationMs } = req.body;
    if (!wallet || !sessionId || !openedAt || !closedAt || !durationMs) {
      return res.status(400).json({ error: "wallet, sessionId, openedAt, closedAt, and durationMs are required" });
    }
    const ownerCheck = await storage.getSessionHistory(vaultId, wallet);
    if (ownerCheck === null) {
      return res.status(403).json({ error: "Access denied: wallet does not own this vault" });
    }
    const entry = await storage.createSessionHistoryEntry({
      vaultId,
      ownerWallet: wallet,
      sessionId,
      label: label ?? "General session",
      authorizedAddress: authorizedAddress ?? "Any holder",
      openedAt: new Date(openedAt),
      closedAt: new Date(closedAt),
      durationMs,
      shareWithProtocol: false,
    });
    res.status(201).json({ id: entry.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to record session history" });
  }
});

router.patch("/sessions/:vaultId/sharing", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { wallet, share } = req.body;
    if (!wallet || typeof share !== "boolean") {
      return res.status(400).json({ error: "wallet and share (boolean) are required" });
    }
    const updated = await storage.setVaultHistorySharing(vaultId, wallet, share);
    if (!updated) {
      return res.status(403).json({ error: "Access denied: wallet does not own this vault" });
    }
    res.json({ ok: true, shareWithProtocol: share });
  } catch (err) {
    res.status(500).json({ error: "Failed to update sharing preference" });
  }
});

router.get("/sessions/:vaultId/system-aggregate", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const aggregate = await storage.getSystemSessionAggregate(vaultId);
    if (aggregate === null) {
      return res.json({ shared: false });
    }
    res.json({
      shared: true,
      totalSessions: aggregate.totalSessions,
      totalDurationMs: aggregate.totalDurationMs,
      lastActivityAt: aggregate.lastActivityAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch system aggregate" });
  }
});

export default router;
