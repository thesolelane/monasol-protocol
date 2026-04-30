// PATCH for src/storage.ts
// Two occurrences of the action union need updating — both to the same value.
//
// FIND (both occurrences, lines ~46 and ~281):
//   action: "deploy" | "move_in" | "session_open" | "session_close" | "lease_transfer";
//
// REPLACE WITH:
//   action: "deploy" | "move_in" | "session_open" | "session_close" | "lease_transfer" | "oracle_register" | "oracle_settle" | "oracle_finalize";
//
// That's it — one string change in two places. Nothing else in storage.ts changes.
//
// oracle_register  — fired by POST /api/oracle/register-session
// oracle_settle    — fired by POST /api/oracle/confirm-settlement
// oracle_finalize  — fired by POST /api/oracle/finalize-release
