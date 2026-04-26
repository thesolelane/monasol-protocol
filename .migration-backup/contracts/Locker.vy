# @version ^0.4.0
# @title MonaSol Locker
# @notice A single building in the MonaSol neighborhood.
#         Capacity is set once at deployment and never changes.
#         Each slot is one apartment (vault).
#         Move-in fee collected here, forwarded to TreasurySplitter.
# @dev Deployed by LockerFactory only. Never directly by users.

# ── Interfaces ────────────────────────────────────────────

interface ITreasurySplitter:
    def split(_from: address): payable

# ── Events ────────────────────────────────────────────────

event VaultMoveIn:
    slot_index:    indexed(uint256)
    occupant:      indexed(address)
    fee_paid:      uint256

event VaultCleared:
    slot_index:    indexed(uint256)

event LockerPaused:
    reason:        String[64]

event LockerResumed:
    pass

event FeeUpdated:
    new_fee:       uint256

# ── Storage ───────────────────────────────────────────────

capacity:          public(uint256)
locker_id:         public(uint256)
tier:              public(String[16])
factory:           public(address)
protocol:          public(address)
treasury_splitter: public(address)

occupied:          public(HashMap[uint256, bool])
occupant:          public(HashMap[uint256, address])
vault_address:     public(HashMap[uint256, address])
occupied_count:    public(uint256)

move_in_fee:       public(uint256)
is_paused:         public(bool)

# ── Constructor ───────────────────────────────────────────

@deploy
def __init__(
    _capacity:         uint256,
    _locker_id:        uint256,
    _tier:             String[16],
    _protocol:         address,
    _treasury_splitter: address,
    _move_in_fee:      uint256
):
    assert _capacity > 0,                        "Capacity must be at least 1"
    assert _capacity <= 1_000_000,               "Capacity ceiling exceeded"
    assert _protocol != empty(address),          "Invalid protocol address"
    assert _treasury_splitter != empty(address), "Invalid splitter address"

    self.capacity           = _capacity
    self.locker_id          = _locker_id
    self.tier               = _tier
    self.factory            = msg.sender
    self.protocol           = _protocol
    self.treasury_splitter  = _treasury_splitter
    self.move_in_fee        = _move_in_fee
    self.occupied_count     = 0
    self.is_paused          = False

# ── Internal guards ───────────────────────────────────────

@internal
def _only_protocol():
    assert msg.sender == self.protocol, "Protocol only"

@internal
def _not_paused():
    assert not self.is_paused, "Locker is paused"

@internal
@view
def _valid_slot(_slot: uint256):
    assert _slot < self.capacity, "Slot out of range"

# ── Move-in ───────────────────────────────────────────────

@external
@payable
def move_in(_slot_index: uint256, _vault_contract: address):
    """
    Rents a vault slot. Fee forwarded to TreasurySplitter.
    Backend confirms Solana multisig consensus before calling this.
    """
    self._not_paused()
    self._valid_slot(_slot_index)

    assert not self.occupied[_slot_index],    "Slot already occupied"
    assert _vault_contract != empty(address), "Invalid vault address"
    assert msg.value == self.move_in_fee,     "Incorrect move-in fee"

    self.occupied[_slot_index]      = True
    self.occupant[_slot_index]      = msg.sender
    self.vault_address[_slot_index] = _vault_contract
    self.occupied_count            += 1

    extcall ITreasurySplitter(self.treasury_splitter).split(msg.sender, value=msg.value)

    log VaultMoveIn(slot_index=_slot_index, occupant=msg.sender, fee_paid=msg.value)

# ── Views ─────────────────────────────────────────────────

@external
@view
def available_slots() -> uint256:
    return self.capacity - self.occupied_count

@external
@view
def is_full() -> bool:
    return self.occupied_count == self.capacity

@external
@view
def get_slot(_slot_index: uint256) -> (bool, address, address):
    self._valid_slot(_slot_index)
    return (
        self.occupied[_slot_index],
        self.occupant[_slot_index],
        self.vault_address[_slot_index]
    )

# ── Protocol only ─────────────────────────────────────────

@external
def clear_slot(_slot_index: uint256):
    self._only_protocol()
    self._valid_slot(_slot_index)
    assert self.occupied[_slot_index], "Slot already empty"

    self.occupied[_slot_index]      = False
    self.occupant[_slot_index]      = empty(address)
    self.vault_address[_slot_index] = empty(address)
    self.occupied_count            -= 1

    log VaultCleared(slot_index=_slot_index)

@external
def set_move_in_fee(_new_fee: uint256):
    self._only_protocol()
    self.move_in_fee = _new_fee
    log FeeUpdated(new_fee=_new_fee)

@external
def pause(_reason: String[64]):
    self._only_protocol()
    self.is_paused = True
    log LockerPaused(reason=_reason)

@external
def resume():
    self._only_protocol()
    self.is_paused = False
    log LockerResumed()
