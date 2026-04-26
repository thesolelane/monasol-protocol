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

export default router;
