# @version ^0.3.0
"""
MonaSol Neighborhood Watch Contract
Deployed per Locker on Monad (EVM)
Handles watcher staking, alert reporting, collective locks, and slashing.
Supports Tier 1 (Community Node) and Tier 2 (Registered Watcher) with tier multipliers.
"""

# Structs
struct Watcher:
    is_active: bool
    stake: uint256
    reputation_score: uint256  # 0-1000, starts at 500
    false_positives: uint256
    successful_alerts: uint256
    last_activity: uint256
    backup_node: address
    tier: uint8  # 1 = Community Node (no stake), 2 = Registered Watcher (MSL stake), 3 = KYC/Verified (future)
    last_ping: uint256  # Timestamp of last heartbeat

struct Alert:
    reporter: address
    locker: address
    vault_id: uint256
    alert_type: String[16]
    severity: uint8  # 1-5
    timestamp: uint256
    resolved: bool
    valid: bool  # True = real threat, False = false positive

struct LockerState:
    vault_count: uint256
    collective_lock_active: bool
    lock_timestamp: uint256
    lock_reason: String[64]
    health_score: uint256  # 0-1000

struct VaultSecurity:
    mode: uint8  # 1=System, 2=Self
    locked: bool
    last_auth: uint256
    auth_failures: uint256
    sub_vault_count: uint256

# Constants
MIN_STAKE: constant(uint256) = 10000 * 10**18  # 10,000 MSL (Tier 2+)
MAX_VAULTS: constant(uint256) = 20000
MODE_SYSTEM: constant(uint8) = 1
MODE_SELF: constant(uint8) = 2
SEVERITY_CRITICAL: constant(uint8) = 4
HEALTH_THRESHOLD: constant(uint256) = 950  # 95.0%

TIER_COMMUNITY: constant(uint8) = 1    # Community Node — no stake, 1x multiplier
TIER_REGISTERED: constant(uint8) = 2  # Registered Watcher — MSL stake, 2x multiplier
TIER_VERIFIED: constant(uint8) = 3    # KYC/Verified — future, 3x multiplier

PING_INTERVAL: constant(uint256) = 300  # 5 minutes (300 seconds)

# Reward multipliers (basis points, 100 = 1x)
MULTIPLIER_TIER1: constant(uint256) = 100   # 1x
MULTIPLIER_TIER2: constant(uint256) = 200   # 2x
MULTIPLIER_TIER3: constant(uint256) = 300   # 3x (future)

# State Variables
owner: public(address)
multisig: public(address)
timelock: public(address)
msl_token: public(address)
oracle: public(address)  # Off-chain oracle wallet authorized to submit pings for Tier 1 nodes

watchers: public(HashMap[address, Watcher])
active_watchers: public(DynArray[address, 100])

alerts: public(HashMap[bytes32, Alert])
alert_count: public(uint256)

locker_states: public(HashMap[address, LockerState])
vault_security: public(HashMap[address, HashMap[uint256, VaultSecurity]])

# Events
event SecurityAlert:
    alert_id: indexed(bytes32)
    locker: indexed(address)
    vault_id: indexed(uint256)
    reporter: address
    alert_type: String[16]
    severity: uint8
    timestamp: uint256

event CollectiveLockTriggered:
    locker: indexed(address)
    triggered_by: indexed(address)
    vault_count: uint256
    reason: String[64]
    timestamp: uint256

event CollectiveLockReleased:
    locker: indexed(address)
    released_by: address
    timestamp: uint256

event WatcherRegistered:
    watcher: indexed(address)
    stake: uint256
    tier: uint8
    timestamp: uint256

event CommunityNodeRegistered:
    watcher: indexed(address)
    tier: uint8
    timestamp: uint256

event WatcherSlashed:
    watcher: indexed(address)
    amount: uint256
    reason: String[64]
    new_reputation: uint256
    timestamp: uint256

event WatcherRewarded:
    watcher: indexed(address)
    amount: uint256
    reason: String[64]
    new_reputation: uint256
    timestamp: uint256

event VaultLocked:
    locker: indexed(address)
    vault_id: indexed(uint256)
    by_collective: bool
    reason: String[64]
    timestamp: uint256

event VaultUnlocked:
    locker: indexed(address)
    vault_id: indexed(uint256)
    by_owner: bool
    timestamp: uint256

event HealthScoreUpdated:
    locker: indexed(address)
    old_score: uint256
    new_score: uint256
    timestamp: uint256

event WatcherPinged:
    watcher: indexed(address)
    timestamp: uint256
    uptime_credit: uint256

event OracleSet:
    old_oracle: address
    new_oracle: indexed(address)
    timestamp: uint256

event WatcherUpgraded:
    watcher: indexed(address)
    old_tier: uint8
    new_tier: uint8
    timestamp: uint256

# Initialization
@external
def __init__(_multisig: address, _timelock: address, _msl_token: address):
    self.owner = msg.sender
    self.multisig = _multisig
    self.timelock = _timelock
    self.msl_token = _msl_token
    self.oracle = empty(address)

@external
def set_oracle(_oracle: address):
    """
    Set the off-chain oracle wallet address.
    Only owner can call this. The oracle is authorized to call ping_for()
    on behalf of Tier 1 Community Nodes.
    """
    assert msg.sender == self.owner, "Only owner"
    old: address = self.oracle
    self.oracle = _oracle
    log OracleSet(old, _oracle, block.timestamp)

# ─── Watcher Management ──────────────────────────────────────────────────────

@external
def register_community_node():
    """
    Register as a Tier 1 Community Node.
    No MSL stake required. Verified via the off-chain API gateway
    (wallet age + X follow check). Earns 1x reward multiplier.
    """
    assert not self.watchers[msg.sender].is_active, "Already registered"

    self.watchers[msg.sender] = Watcher({
        is_active: True,
        stake: 0,
        reputation_score: 500,
        false_positives: 0,
        successful_alerts: 0,
        last_activity: block.timestamp,
        backup_node: empty(address),
        tier: TIER_COMMUNITY,
        last_ping: block.timestamp,
    })

    self.active_watchers.append(msg.sender)

    log CommunityNodeRegistered(msg.sender, TIER_COMMUNITY, block.timestamp)

@external
def register_watcher(_backup_node: address):
    """
    Register as a Tier 2 Registered Watcher.
    Requires MSL stake (10,000 MSL). Earns 2x reward multiplier.
    """
    assert not self.watchers[msg.sender].is_active, "Already registered"

    # Transfer MSL stake from watcher to contract
    # (In production, use ERC20 transferFrom with IERC20(self.msl_token).transferFrom(...))

    self.watchers[msg.sender] = Watcher({
        is_active: True,
        stake: MIN_STAKE,
        reputation_score: 500,
        false_positives: 0,
        successful_alerts: 0,
        last_activity: block.timestamp,
        backup_node: _backup_node,
        tier: TIER_REGISTERED,
        last_ping: block.timestamp,
    })

    self.active_watchers.append(msg.sender)

    log WatcherRegistered(msg.sender, MIN_STAKE, TIER_REGISTERED, block.timestamp)

@external
def upgrade_to_registered(_backup_node: address):
    """
    Upgrade from Community Node (Tier 1) to Registered Watcher (Tier 2).
    Requires MSL stake deposit.
    """
    watcher: Watcher = self.watchers[msg.sender]
    assert watcher.is_active, "Not registered"
    assert watcher.tier == TIER_COMMUNITY, "Already Tier 2 or higher"

    # Transfer MSL stake
    # (In production, use ERC20 transferFrom)

    old_tier: uint8 = watcher.tier
    watcher.stake = MIN_STAKE
    watcher.tier = TIER_REGISTERED
    watcher.backup_node = _backup_node

    self.watchers[msg.sender] = watcher

    log WatcherUpgraded(msg.sender, old_tier, TIER_REGISTERED, block.timestamp)

@external
def unregister_watcher():
    assert self.watchers[msg.sender].is_active, "Not registered"

    watcher: Watcher = self.watchers[msg.sender]

    # Return stake for Tier 2 (if no pending alerts)
    # (In production, check for unresolved alerts and use ERC20 transfer)

    self.watchers[msg.sender].is_active = False

    # Remove from active_watchers array (simplified — full impl uses index tracking)

@external
def rotate_backup_node(_new_backup: address):
    assert self.watchers[msg.sender].is_active, "Not registered"
    self.watchers[msg.sender].backup_node = _new_backup

@external
def ping():
    """
    Heartbeat function. Called every 5 minutes by the mobile app background
    service (ACTIVE nodes only). Records uptime for reward calculation.
    Tier 1 nodes without on-chain write access call the API instead, which
    batches pings. This on-chain version is for Tier 2+ nodes.
    """
    watcher: Watcher = self.watchers[msg.sender]
    assert watcher.is_active, "Not an active watcher"

    time_since_last_ping: uint256 = block.timestamp - watcher.last_ping
    uptime_credit: uint256 = time_since_last_ping  # seconds of credited uptime

    self.watchers[msg.sender].last_ping = block.timestamp
    self.watchers[msg.sender].last_activity = block.timestamp

    log WatcherPinged(msg.sender, block.timestamp, uptime_credit)

@external
def ping_for(_watcher: address):
    """
    Oracle-submitted heartbeat on behalf of a Tier 1 Community Node.

    Only the authorized oracle wallet (set via set_oracle) may call this.
    This allows the off-chain API server to batch-submit heartbeats for
    Tier 1 nodes who lack on-chain write access (no stake = no gas budget).

    The ping is credited to _watcher's uptime record, not msg.sender,
    ensuring attribution is correct for reward calculation.
    """
    assert msg.sender == self.oracle, "Only oracle"
    assert self.oracle != empty(address), "Oracle not set"

    watcher: Watcher = self.watchers[_watcher]
    assert watcher.is_active, "Not an active watcher"
    assert watcher.tier == TIER_COMMUNITY, "ping_for is only for Tier 1 nodes"

    time_since_last_ping: uint256 = block.timestamp - watcher.last_ping
    uptime_credit: uint256 = time_since_last_ping

    self.watchers[_watcher].last_ping = block.timestamp
    self.watchers[_watcher].last_activity = block.timestamp

    log WatcherPinged(_watcher, block.timestamp, uptime_credit)

# ─── Alert System ────────────────────────────────────────────────────────────

@external
def report_alert(_locker: address, _vault_id: uint256, _alert_type: String[16]):
    watcher: Watcher = self.watchers[msg.sender]
    assert watcher.is_active, "Not an active watcher"
    assert watcher.reputation_score >= 200, "Reputation too low"

    # Tier 2+ requires minimum stake; Tier 1 has no stake requirement
    if watcher.tier >= TIER_REGISTERED:
        assert watcher.stake >= MIN_STAKE, "Insufficient stake"

    # Generate unique alert ID
    alert_id: bytes32 = keccak256(concat(
        convert(_locker, bytes20),
        convert(_vault_id, bytes32),
        convert(block.timestamp, bytes32),
        convert(msg.sender, bytes20)
    ))

    severity: uint8 = self._get_severity(_alert_type)

    self.alerts[alert_id] = Alert({
        reporter: msg.sender,
        locker: _locker,
        vault_id: _vault_id,
        alert_type: _alert_type,
        severity: severity,
        timestamp: block.timestamp,
        resolved: False,
        valid: False  # Pending resolution
    })

    self.alert_count += 1
    self.watchers[msg.sender].last_activity = block.timestamp

    log SecurityAlert(alert_id, _locker, _vault_id, msg.sender, _alert_type, severity, block.timestamp)

    # Auto-trigger collective lock for critical alerts on System-mode vaults
    if severity >= SEVERITY_CRITICAL:
        vault_sec: VaultSecurity = self.vault_security[_locker][_vault_id]
        if vault_sec.mode == MODE_SYSTEM:
            self._initiate_collective_lock(_locker, msg.sender, _alert_type)

@internal
def _get_severity(_alert_type: String[16]) -> uint8:
    if _alert_type == "LARGE_OUTFLOW":
        return 5
    elif _alert_type == "UNUSUAL_PATTERN":
        return 4
    elif _alert_type == "AUTH_FAILURES":
        return 3
    elif _alert_type == "NFT_TRANSFER":
        return 3
    elif _alert_type == "SUB_VAULT_BREACH":
        return 5
    elif _alert_type == "NODE_HEALTH_LOW":
        return 4
    elif _alert_type == "PLEDGE_VIOLATION":
        return 5
    else:
        return 2

# ─── Collective Lock Mechanism ───────────────────────────────────────────────

@internal
def _initiate_collective_lock(_locker: address, _triggered_by: address, _reason: String[64]):
    state: LockerState = self.locker_states[_locker]

    if state.collective_lock_active:
        return  # Already locked

    state.collective_lock_active = True
    state.lock_timestamp = block.timestamp
    state.lock_reason = _reason

    # Lock all System-mode vaults
    locked_count: uint256 = 0
    for i in range(MAX_VAULTS):
        if i >= state.vault_count:
            break
        vault_sec: VaultSecurity = self.vault_security[_locker][i]
        if vault_sec.mode == MODE_SYSTEM and not vault_sec.locked:
            vault_sec.locked = True
            locked_count += 1
            log VaultLocked(_locker, i, True, _reason, block.timestamp)

    log CollectiveLockTriggered(_locker, _triggered_by, locked_count, _reason, block.timestamp)

@external
def release_collective_lock(_locker: address):
    assert msg.sender == self.multisig, "Only multisig can release"

    state: LockerState = self.locker_states[_locker]
    assert state.collective_lock_active, "Not locked"

    state.collective_lock_active = False
    state.lock_timestamp = 0
    state.lock_reason = ""

    # Unlock all System-mode vaults
    for i in range(MAX_VAULTS):
        if i >= state.vault_count:
            break
        vault_sec: VaultSecurity = self.vault_security[_locker][i]
        if vault_sec.mode == MODE_SYSTEM:
            vault_sec.locked = False
            log VaultUnlocked(_locker, i, False, block.timestamp)

    log CollectiveLockReleased(_locker, msg.sender, block.timestamp)

# ─── Self-Mode Vault Control (Owner Only) ────────────────────────────────────

@external
def self_lock_vault(_locker: address, _vault_id: uint256):
    # In production, verify NFT ownership via light client
    vault_sec: VaultSecurity = self.vault_security[_locker][_vault_id]
    assert vault_sec.mode == MODE_SELF, "Only Self-mode vaults"

    vault_sec.locked = True
    log VaultLocked(_locker, _vault_id, False, "Owner initiated", block.timestamp)

@external
def self_unlock_vault(_locker: address, _vault_id: uint256):
    # In production, verify NFT ownership via light client
    vault_sec: VaultSecurity = self.vault_security[_locker][_vault_id]
    assert vault_sec.mode == MODE_SELF, "Only Self-mode vaults"
    assert vault_sec.locked, "Not locked"

    vault_sec.locked = False
    log VaultUnlocked(_locker, _vault_id, True, block.timestamp)

# ─── Alert Resolution & Slashing ─────────────────────────────────────────────

@external
def resolve_alert(_alert_id: bytes32, _valid: bool):
    assert msg.sender == self.multisig, "Only multisig"

    alert: Alert = self.alerts[_alert_id]
    assert not alert.resolved, "Already resolved"

    alert.resolved = True
    alert.valid = _valid

    reporter: address = alert.reporter
    watcher: Watcher = self.watchers[reporter]

    if _valid:
        # Reward watcher
        watcher.successful_alerts += 1
        reward: uint256 = self._calculate_reward(watcher)
        watcher.reputation_score = min(watcher.reputation_score + 50, 1000)

        log WatcherRewarded(reporter, reward, "Valid alert", watcher.reputation_score, block.timestamp)
    else:
        # Slash watcher (only Tier 2+ have stake to slash)
        watcher.false_positives += 1
        if watcher.tier >= TIER_REGISTERED and watcher.stake > 0:
            slash_amount: uint256 = self._calculate_slash(watcher)
            watcher.stake -= slash_amount
        watcher.reputation_score = max(watcher.reputation_score - 100, 0)

        if watcher.reputation_score < 200:
            watcher.is_active = False

        slash_logged: uint256 = 0
        if watcher.tier >= TIER_REGISTERED:
            slash_logged = self._calculate_slash(watcher)
        log WatcherSlashed(reporter, slash_logged, "False positive", watcher.reputation_score, block.timestamp)

    self.watchers[reporter] = watcher

@internal
def _calculate_reward(_watcher: Watcher) -> uint256:
    """
    Reward calculation with tier multipliers:
    - Tier 1 (Community Node):   1x multiplier
    - Tier 2 (Registered):       2x multiplier
    - Tier 3 (KYC/Verified):     3x multiplier (future)
    """
    base: uint256 = 100 * 10**18  # 100 MSL base reward

    tier_multiplier: uint256 = MULTIPLIER_TIER1  # default 1x
    if _watcher.tier == TIER_REGISTERED:
        tier_multiplier = MULTIPLIER_TIER2
    elif _watcher.tier == TIER_VERIFIED:
        tier_multiplier = MULTIPLIER_TIER3

    rep_multiplier: uint256 = _watcher.reputation_score / 500
    if rep_multiplier == 0:
        rep_multiplier = 1

    return (base * tier_multiplier * rep_multiplier) / 100

@internal
def _calculate_slash(_watcher: Watcher) -> uint256:
    base: uint256 = 500 * 10**18  # 500 MSL
    fp_multiplier: uint256 = _watcher.false_positives
    return base * (1 + fp_multiplier)

# ─── Health Score Management ──────────────────────────────────────────────────

@external
def update_locker_health(_locker: address, _uptime: uint256, _sig_success: uint256):
    # Called by authorized oracle/node monitoring service
    assert msg.sender == self.multisig or self._is_watcher(msg.sender), "Unauthorized"

    old_score: uint256 = self.locker_states[_locker].health_score
    # health_score = (uptime + signature_success) / 2, scaled to 0-1000
    new_score: uint256 = ((_uptime + _sig_success) * 1000) / 200

    self.locker_states[_locker].health_score = new_score

    log HealthScoreUpdated(_locker, old_score, new_score, block.timestamp)

    # Auto-trigger if health drops below threshold
    if new_score < HEALTH_THRESHOLD and not self.locker_states[_locker].collective_lock_active:
        self._initiate_collective_lock(_locker, msg.sender, "Health below threshold")

@internal
def _is_watcher(_addr: address) -> bool:
    watcher: Watcher = self.watchers[_addr]
    if not watcher.is_active:
        return False
    # Tier 1 needs only active status; Tier 2+ needs stake
    if watcher.tier == TIER_COMMUNITY:
        return True
    return watcher.stake >= MIN_STAKE

# ─── View Functions ──────────────────────────────────────────────────────────

@view
@external
def get_watcher_info(_watcher: address) -> Watcher:
    return self.watchers[_watcher]

@view
@external
def get_alert(_alert_id: bytes32) -> Alert:
    return self.alerts[_alert_id]

@view
@external
def get_locker_state(_locker: address) -> LockerState:
    return self.locker_states[_locker]

@view
@external
def get_vault_security(_locker: address, _vault_id: uint256) -> VaultSecurity:
    return self.vault_security[_locker][_vault_id]

@view
@external
def is_collective_locked(_locker: address) -> bool:
    return self.locker_states[_locker].collective_lock_active

@view
@external
def get_tier_multiplier(_watcher: address) -> uint256:
    """Returns the reward multiplier in basis points (100 = 1x, 200 = 2x, 300 = 3x)."""
    watcher: Watcher = self.watchers[_watcher]
    if not watcher.is_active:
        return 0
    if watcher.tier == TIER_REGISTERED:
        return MULTIPLIER_TIER2
    elif watcher.tier == TIER_VERIFIED:
        return MULTIPLIER_TIER3
    return MULTIPLIER_TIER1
