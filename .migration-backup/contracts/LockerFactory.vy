# @version ^0.4.0
# @title MonaSol LockerFactory
# @notice Deployed once by the protocol.
#         Creates and registers all Lockers.
#         Only authorized backend deployers can create Lockers.

# ── Events ────────────────────────────────────────────────

event LockerDeployed:
    locker_id:      indexed(uint256)
    locker_address: indexed(address)
    capacity:       uint256
    tier:           String[16]

event DeployerAuthorized:
    deployer:       indexed(address)

event DeployerRevoked:
    deployer:       indexed(address)

event AutopilotToggled:
    enabled:        bool

# ── Storage ───────────────────────────────────────────────

protocol:          public(address)
treasury_splitter: public(address)
locker_blueprint:  public(address)   # Compiled Locker blueprint address

locker_count:      public(uint256)
lockers:           public(HashMap[uint256, address])

authorized:        public(HashMap[address, bool])
autopilot_enabled: public(bool)

# ── Constructor ───────────────────────────────────────────

@deploy
def __init__(
    _protocol:          address,
    _treasury_splitter: address,
    _locker_blueprint:  address
):
    assert _protocol          != empty(address), "Invalid protocol"
    assert _treasury_splitter != empty(address), "Invalid splitter"
    assert _locker_blueprint  != empty(address), "Invalid blueprint"

    self.protocol           = _protocol
    self.treasury_splitter  = _treasury_splitter
    self.locker_blueprint   = _locker_blueprint
    self.locker_count       = 0
    self.autopilot_enabled  = True
    self.authorized[_protocol] = True

# ── Guards ────────────────────────────────────────────────

@internal
def _only_authorized():
    assert self.authorized[msg.sender], "Not authorized"

@internal
def _only_protocol():
    assert msg.sender == self.protocol, "Protocol only"

# ── Deploy ────────────────────────────────────────────────

@external
def deploy_locker(
    _capacity:    uint256,
    _tier:        String[16],
    _move_in_fee: uint256
) -> address:
    """
    Deploys a new Locker from the blueprint.
    Capacity is fully flexible — backend decides the number.
    Tier is a label for the product layer, not enforced on-chain.
    Institutional/dedicated lockers pass whatever capacity is agreed.
    """
    self._only_authorized()
    assert _capacity > 0,          "Capacity must be at least 1"
    assert _capacity <= 1_000_000, "Capacity ceiling exceeded"

    locker_id: uint256  = self.locker_count

    new_locker: address = create_from_blueprint(
        self.locker_blueprint,
        locker_id,
        _capacity,
        _tier,
        self.protocol,
        self.treasury_splitter,
        _move_in_fee,
        code_offset=3
    )

    self.lockers[locker_id] = new_locker
    self.locker_count      += 1

    log LockerDeployed(locker_id=locker_id, locker_address=new_locker, capacity=_capacity, tier=_tier)

    return new_locker

# ── Autopilot ─────────────────────────────────────────────

@external
@view
def is_locker_full(_locker_id: uint256) -> bool:
    """
    Backend watcher calls this on a schedule.
    If True, backend decides whether to auto-deploy a new locker.
    Decision logic stays in the backend, not here.
    """
    assert _locker_id < self.locker_count, "Unknown locker"
    # Call is_full on the locker contract
    response: Bytes[32] = raw_call(
        self.lockers[_locker_id],
        method_id("is_full()"),
        max_outsize=32,
        is_static_call=True
    )
    return convert(response, bool)

# ── Authorization ─────────────────────────────────────────

@external
def authorize_deployer(_deployer: address):
    self._only_protocol()
    assert _deployer != empty(address), "Invalid address"
    self.authorized[_deployer] = True
    log DeployerAuthorized(deployer=_deployer)

@external
def revoke_deployer(_deployer: address):
    self._only_protocol()
    self.authorized[_deployer] = False
    log DeployerRevoked(deployer=_deployer)

@external
def toggle_autopilot(_enabled: bool):
    self._only_protocol()
    self.autopilot_enabled = _enabled
    log AutopilotToggled(enabled=_enabled)

# ── Views ─────────────────────────────────────────────────

@external
@view
def get_locker(_id: uint256) -> address:
    assert _id < self.locker_count, "Unknown locker"
    return self.lockers[_id]

@external
@view
def total_lockers() -> uint256:
    return self.locker_count
