# @version ^0.4.0
# @title MonaSol TreasurySplitter
# @notice Receives move-in fees from Lockers.
#         Splits each payment between protocol treasury
#         and liquidity pool. Ratio set by protocol owner.

# ── Events ────────────────────────────────────────────────

event FeeSplit:
    sender:        indexed(address)
    total:         uint256
    to_treasury:   uint256
    to_pool:       uint256

event RatioUpdated:
    treasury_bps:  uint256
    pool_bps:      uint256

# ── Storage ───────────────────────────────────────────────

protocol:         public(address)
treasury:         public(address)
liquidity_pool:   public(address)

# Basis points — must sum to 10000
treasury_bps:     public(uint256)   # e.g. 7000 = 70%
pool_bps:         public(uint256)   # e.g. 3000 = 30%

# ── Constructor ───────────────────────────────────────────

@deploy
def __init__(
    _protocol:       address,
    _treasury:       address,
    _liquidity_pool: address,
    _treasury_bps:   uint256
):
    assert _protocol       != empty(address), "Invalid protocol"
    assert _treasury       != empty(address), "Invalid treasury"
    assert _liquidity_pool != empty(address), "Invalid pool"
    assert _treasury_bps   <= 10000,          "BPS overflow"

    self.protocol       = _protocol
    self.treasury       = _treasury
    self.liquidity_pool = _liquidity_pool
    self.treasury_bps   = _treasury_bps
    self.pool_bps       = 10000 - _treasury_bps

# ── Split ─────────────────────────────────────────────────

@external
@payable
def split(_from: address):
    """
    Called by Locker on every move-in.
    Splits msg.value between treasury and liquidity pool.
    """
    assert msg.value > 0, "Nothing to split"

    to_treasury: uint256 = (msg.value * self.treasury_bps) // 10000
    to_pool:     uint256 = msg.value - to_treasury

    send(self.treasury,       to_treasury)
    send(self.liquidity_pool, to_pool)

    log FeeSplit(sender=_from, total=msg.value, to_treasury=to_treasury, to_pool=to_pool)

# ── Protocol only ─────────────────────────────────────────

@external
def update_ratio(_treasury_bps: uint256):
    assert msg.sender == self.protocol, "Protocol only"
    assert _treasury_bps <= 10000,      "BPS overflow"
    self.treasury_bps = _treasury_bps
    self.pool_bps     = 10000 - _treasury_bps
    log RatioUpdated(treasury_bps=_treasury_bps, pool_bps=self.pool_bps)

@external
def update_treasury(_addr: address):
    assert msg.sender == self.protocol, "Protocol only"
    assert _addr != empty(address),     "Invalid address"
    self.treasury = _addr

@external
def update_pool(_addr: address):
    assert msg.sender == self.protocol, "Protocol only"
    assert _addr != empty(address),     "Invalid address"
    self.liquidity_pool = _addr
