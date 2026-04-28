# @version 0.4.0
# @title MonaSol Locker
# @notice A single building in the MonaSol neighborhood.
#         Capacity is fixed at deployment. Each slot is one vault (apartment).
#         Vault logic lives inside this contract — no separate vault contract.
#         Lease transfers keep the same slot. New owner inherits all contents.
#         Shard regeneration starts on Solana, finalizes here.
# @dev Deployed by LockerFactory only.

interface ITreasurySplitter:
    def split(_from: address): payable

SYSTEM_MODE: constant(uint8) = 1
SELF_MODE:   constant(uint8) = 2

event VaultMoveIn:
    slot_index:     indexed(uint256)
    occupant:       indexed(address)
    signing_wallet: address
    security_mode:  uint8
    fee_paid:       uint256

event LeaseTransferred:
    slot_index:     indexed(uint256)
    old_owner:      indexed(address)
    new_owner:      indexed(address)
    new_signer:     address

event VaultReadOnly:
    slot_index:     indexed(uint256)
    reason:         String[64]

event VaultReadOnlyLifted:
    slot_index:     indexed(uint256)

event SecurityModeChanged:
    slot_index:     indexed(uint256)
    new_mode:       uint8

event VaultCleared:
    slot_index:     indexed(uint256)

event LockerPaused:
    reason:         String[64]

event LockerResumed:
    pass

event FeeUpdated:
    new_fee:        uint256

# Occupancy
occupied:        public(HashMap[uint256, bool])
occupant:        public(HashMap[uint256, address])
signing_wallet:  public(HashMap[uint256, address])
nft_mint:        public(HashMap[uint256, String[64]])
security_mode:   public(HashMap[uint256, uint8])
is_read_only:    public(HashMap[uint256, bool])
session_active:  public(HashMap[uint256, bool])
session_expiry:  public(HashMap[uint256, uint256])

# Locker level
capacity:          public(uint256)
locker_id:         public(uint256)
tier:              public(String[16])
factory:           public(address)
protocol:          public(address)
treasury_splitter: public(address)
occupied_count:    public(uint256)
move_in_fee:       public(uint256)
is_paused:         public(bool)

@deploy
def __init__(
    _locker_id:         uint256,
    _capacity:          uint256,
    _tier:              String[16],
    _protocol:          address,
    _treasury_splitter: address,
    _move_in_fee:       uint256
):
    assert _capacity > 0,                        "Capacity must be at least 1"
    assert _capacity <= 1_000_000,               "Capacity ceiling exceeded"
    assert _protocol          != empty(address), "Invalid protocol address"
    assert _treasury_splitter != empty(address), "Invalid splitter address"

    self.locker_id          = _locker_id
    self.capacity           = _capacity
    self.tier               = _tier
    self.factory            = msg.sender
    self.protocol           = _protocol
    self.treasury_splitter  = _treasury_splitter
    self.move_in_fee        = _move_in_fee
    self.occupied_count     = 0
    self.is_paused          = False

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

@internal
@view
def _slot_occupied(_slot: uint256):
    assert self.occupied[_slot], "Slot not occupied"

@internal
@view
def _active_session(_slot: uint256):
    assert self.session_active[_slot],                   "No active session"
    assert block.timestamp < self.session_expiry[_slot], "Session expired"

@internal
@view
def _not_read_only(_slot: uint256):
    assert not self.is_read_only[_slot], "Vault is read-only"

@external
@payable
def move_in(
    _slot_index:     uint256,
    _signing_wallet: address,
    _nft_mint:       String[64],
    _security_mode:  uint8
):
    self._not_paused()
    self._valid_slot(_slot_index)

    assert not self.occupied[_slot_index],    "Slot already occupied"
    assert _signing_wallet != empty(address), "Invalid signing wallet"
    assert len(_nft_mint) > 0,               "NFT mint required"
    assert _security_mode == SYSTEM_MODE or _security_mode == SELF_MODE, "Invalid security mode"
    assert msg.value == self.move_in_fee,    "Incorrect move-in fee"

    self.occupied[_slot_index]       = True
    self.occupant[_slot_index]       = msg.sender
    self.signing_wallet[_slot_index] = _signing_wallet
    self.nft_mint[_slot_index]       = _nft_mint
    self.security_mode[_slot_index]  = _security_mode
    self.is_read_only[_slot_index]   = False
    self.session_active[_slot_index] = False
    self.occupied_count             += 1

    extcall ITreasurySplitter(self.treasury_splitter).split(msg.sender, value=msg.value)

    log VaultMoveIn(_slot_index, msg.sender, _signing_wallet, _security_mode, msg.value)

@external
def transfer_lease(
    _slot_index:   uint256,
    _new_owner:    address,
    _new_signer:   address,
    _new_nft_mint: String[64]
):
    self._only_protocol()
    self._valid_slot(_slot_index)
    self._slot_occupied(_slot_index)

    assert _new_owner  != empty(address), "Invalid new owner"
    assert _new_signer != empty(address), "Invalid new signer"
    assert len(_new_nft_mint) > 0,        "NFT mint required"

    old_owner: address = self.occupant[_slot_index]

    self.occupant[_slot_index]       = _new_owner
    self.signing_wallet[_slot_index] = _new_signer
    self.nft_mint[_slot_index]       = _new_nft_mint
    self.session_active[_slot_index] = False
    self.session_expiry[_slot_index] = 0
    self.is_read_only[_slot_index]   = False

    log LeaseTransferred(_slot_index, old_owner, _new_owner, _new_signer)

@external
def open_session(_slot_index: uint256, _duration_seconds: uint256):
    self._only_protocol()
    self._valid_slot(_slot_index)
    self._slot_occupied(_slot_index)
    self._not_read_only(_slot_index)

    assert _duration_seconds > 0,       "Duration required"
    assert _duration_seconds <= 86400,  "Max session 24 hours"

    self.session_active[_slot_index] = True
    self.session_expiry[_slot_index] = block.timestamp + _duration_seconds

@external
def close_session(_slot_index: uint256):
    self._valid_slot(_slot_index)
    self._slot_occupied(_slot_index)

    assert msg.sender == self.signing_wallet[_slot_index] or \
           msg.sender == self.protocol, "Not authorized"

    self.session_active[_slot_index] = False
    self.session_expiry[_slot_index] = 0

@external
def set_read_only(_slot_index: uint256, _reason: String[64]):
    self._only_protocol()
    self._valid_slot(_slot_index)
    self._slot_occupied(_slot_index)

    self.is_read_only[_slot_index]   = True
    self.session_active[_slot_index] = False

    log VaultReadOnly(_slot_index, _reason)

@external
def lift_read_only(_slot_index: uint256):
    self._only_protocol()
    self._valid_slot(_slot_index)
    self._slot_occupied(_slot_index)

    assert self.is_read_only[_slot_index], "Not in read-only mode"

    self.is_read_only[_slot_index] = False

    log VaultReadOnlyLifted(_slot_index)

@external
def set_security_mode(_slot_index: uint256, _mode: uint8):
    self._valid_slot(_slot_index)
    self._slot_occupied(_slot_index)
    self._active_session(_slot_index)

    assert msg.sender == self.signing_wallet[_slot_index], "Not authorized signer"
    assert _mode == SYSTEM_MODE or _mode == SELF_MODE,     "Invalid mode"

    self.security_mode[_slot_index] = _mode

    log SecurityModeChanged(_slot_index, _mode)

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
def get_slot(_slot_index: uint256) -> (bool, address, address, uint8, bool, bool):
    self._valid_slot(_slot_index)
    return (
        self.occupied[_slot_index],
        self.occupant[_slot_index],
        self.signing_wallet[_slot_index],
        self.security_mode[_slot_index],
        self.is_read_only[_slot_index],
        self.session_active[_slot_index]
    )

@external
@view
def session_valid(_slot_index: uint256) -> bool:
    if not self.session_active[_slot_index]:
        return False
    return block.timestamp < self.session_expiry[_slot_index]

@external
def clear_slot(_slot_index: uint256):
    self._only_protocol()
    self._valid_slot(_slot_index)
    assert self.occupied[_slot_index], "Slot already empty"

    self.occupied[_slot_index]       = False
    self.occupant[_slot_index]       = empty(address)
    self.signing_wallet[_slot_index] = empty(address)
    self.nft_mint[_slot_index]       = ""
    self.security_mode[_slot_index]  = 0
    self.is_read_only[_slot_index]   = False
    self.session_active[_slot_index] = False
    self.session_expiry[_slot_index] = 0
    self.occupied_count             -= 1

    log VaultCleared(_slot_index)

@external
def set_move_in_fee(_new_fee: uint256):
    self._only_protocol()
    self.move_in_fee = _new_fee
    log FeeUpdated(_new_fee)

@external
def pause(_reason: String[64]):
    self._only_protocol()
    self.is_paused = True
    log LockerPaused(_reason)

@external
def resume():
    self._only_protocol()
    self.is_paused = False
    log LockerResumed()
