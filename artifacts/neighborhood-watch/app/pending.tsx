import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type Observation, useWatcher } from "@/contexts/WatcherContext";
import { useColors } from "@/hooks/useColors";

// Token economics — kept in sync with active dashboard
const MSL_PER_HOUR_TIER1 = 1;
const TESTNET_MULTIPLIER  = 3;

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function formatMSL(amount: number): string {
  if (amount < 0.001) return "0.000";
  if (amount < 1) return amount.toFixed(3);
  if (amount < 1000) return amount.toFixed(2);
  return `${(amount / 1000).toFixed(2)}K`;
}

const ALERT_COLORS: Record<string, string> = {
  AUTH_FAILURES:    "#F59E0B",
  UNUSUAL_PATTERN:  "#8247E5",
  LARGE_OUTFLOW:    "#EF4444",
  NFT_TRANSFER:     "#3B82F6",
  NODE_HEALTH_LOW:  "#F97316",
  SUB_VAULT_BREACH: "#EF4444",
};

const ALERT_ICONS: Record<string, string> = {
  AUTH_FAILURES:    "key",
  UNUSUAL_PATTERN:  "activity",
  LARGE_OUTFLOW:    "trending-down",
  NFT_TRANSFER:     "box",
  NODE_HEALTH_LOW:  "heart",
  SUB_VAULT_BREACH: "shield-off",
};

function ObservationItem({ item, colors }: { item: Observation; colors: any }) {
  const alertColor = ALERT_COLORS[item.type] || colors.accent;
  const alertIcon  = (ALERT_ICONS[item.type] || "alert-circle") as any;
  return (
    <View style={[styles.obsItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.obsIconBg, { backgroundColor: alertColor + "20" }]}>
        <Feather name={alertIcon} size={14} color={alertColor} />
      </View>
      <View style={styles.obsContent}>
        <Text style={[styles.obsType, { color: colors.foreground }]}>
          {item.type.replace(/_/g, " ")}
        </Text>
        <Text style={[styles.obsLocker, { color: colors.mutedForeground }]}>
          {item.lockerId} · {formatTimeAgo(item.timestamp)}
        </Text>
      </View>
      <View style={styles.obsSeverity}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View
            key={i}
            style={[styles.severityBar, { backgroundColor: i < item.severity ? alertColor : colors.border }]}
          />
        ))}
      </View>
    </View>
  );
}

export default function PendingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { node, observations, refreshStatus, isRefreshing } = useWatcher();

  const topPad    = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const countdown   = node ? node.verificationDue - Date.now() : 0;
  const uptime      = node?.uptimeSeconds || 0;
  const hoursActive = uptime / 3600;
  const mslBanked   = hoursActive * MSL_PER_HOUR_TIER1 * TESTNET_MULTIPLIER;
  const lockerCount = new Set(observations.map((o) => o.lockerId)).size;
  const flagCount   = observations.filter((o) => o.severity >= 2).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={observations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: topPad + 16, paddingBottom: bottomPad + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshStatus}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerSection}>
            {/* Title row */}
            <View style={styles.topRow}>
              <View>
                <Text style={[styles.screenBadge, { color: colors.warning }]}>VERIFYING</Text>
                <Text style={[styles.screenTitle, { color: colors.foreground }]}>
                  Verification Pending
                </Text>
              </View>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: colors.warning + "20", borderColor: colors.warning + "40" },
                ]}
              >
                <View style={[styles.statusDot, { backgroundColor: colors.warning }]} />
                <Text style={[styles.statusText, { color: colors.warning }]}>Pending</Text>
              </View>
            </View>

            {/* Countdown */}
            <View style={[styles.countdownCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.countdownLabel, { color: colors.mutedForeground }]}>
                Verification window closes in
              </Text>
              <Text style={[styles.countdown, { color: colors.foreground }]}>
                {formatCountdown(countdown)}
              </Text>
              <Text style={[styles.countdownSub, { color: colors.mutedForeground }]}>
                HH · MM · SS
              </Text>
            </View>

            {/* Hours + MSL banking banner */}
            <View
              style={[
                styles.bankingCard,
                { backgroundColor: colors.card, borderColor: colors.primary + "50" },
              ]}
            >
              <View style={styles.bankingHeader}>
                <View style={[styles.bankingIcon, { backgroundColor: colors.primary + "20" }]}>
                  <Feather name="clock" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bankingTitle, { color: colors.foreground }]}>
                    Time Banking
                  </Text>
                  <Text style={[styles.bankingSub, { color: colors.mutedForeground }]}>
                    Every hour counts toward your mainnet reward
                  </Text>
                </View>
              </View>

              <View style={styles.bankingStats}>
                <View style={styles.bankingStat}>
                  <Text style={[styles.bankingBig, { color: colors.primary }]}>
                    {formatUptime(uptime)}
                  </Text>
                  <Text style={[styles.bankingSmall, { color: colors.mutedForeground }]}>
                    banked so far
                  </Text>
                </View>
                <View style={[styles.bankingDivider, { backgroundColor: colors.border }]} />
                <View style={styles.bankingStat}>
                  <Text style={[styles.bankingBig, { color: colors.accent }]}>
                    {formatMSL(mslBanked)} MSL
                  </Text>
                  <Text style={[styles.bankingSmall, { color: colors.mutedForeground }]}>
                    projected at launch
                  </Text>
                </View>
              </View>

              <View style={[styles.rateRow, { borderTopColor: colors.border }]}>
                <Feather name="zap" size={12} color={colors.accent} />
                <Text style={[styles.rateNote, { color: colors.accent }]}>
                  {MSL_PER_HOUR_TIER1} MSL / hr × {TESTNET_MULTIPLIER}× early bird = {MSL_PER_HOUR_TIER1 * TESTNET_MULTIPLIER} MSL / hr effective rate
                </Text>
              </View>
            </View>

            {/* Quick stats */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="eye" size={16} color={colors.accent} />
                <Text style={[styles.statValue, { color: colors.foreground }]}>{lockerCount}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Lockers</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="flag" size={16} color={colors.warning} />
                <Text style={[styles.statValue, { color: colors.foreground }]}>{flagCount}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Flagged</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="star" size={16} color={colors.success} />
                <Text style={[styles.statValue, { color: colors.foreground }]}>{TESTNET_MULTIPLIER}×</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Bonus</Text>
              </View>
            </View>

            {/* What we check at 48h */}
            <View style={[styles.checkingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.checkingTitle, { color: colors.foreground }]}>
                What we check at 48h
              </Text>
              {CHECKS.map((c) => (
                <View key={c.label} style={styles.checkRow}>
                  <View style={[styles.checkIconBg, { backgroundColor: colors.primary + "15" }]}>
                    <Feather name={c.icon as any} size={14} color={colors.primary} />
                  </View>
                  <View style={styles.checkContent}>
                    <Text style={[styles.checkLabel, { color: colors.foreground }]}>{c.label}</Text>
                    <Text style={[styles.checkDesc, { color: colors.mutedForeground }]}>{c.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Live feed header */}
            <View style={styles.liveFeedHeader}>
              <Text style={[styles.liveFeedTitle, { color: colors.foreground }]}>
                Live Observations
              </Text>
              <View style={styles.liveIndicator}>
                <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.liveText, { color: colors.success }]}>LIVE</Text>
              </View>
            </View>
            <Text style={[styles.liveFeedNote, { color: colors.mutedForeground }]}>
              Observations collected now are discarded on activation (replay-attack prevention).
              Fresh monitoring begins after verification.
            </Text>
          </View>
        }
        renderItem={({ item }) => <ObservationItem item={item} colors={colors} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="radio" size={24} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Scanning lockers...
            </Text>
          </View>
        }
      />
    </View>
  );
}

const CHECKS = [
  {
    icon: "twitter",
    label: "X Follow Verification",
    desc: "Checks @cooperanthllc follow via Twitter API v2 friendship lookup",
  },
  {
    icon: "calendar",
    label: "Wallet Age",
    desc: "First transaction must be ≥ 6 months ago",
  },
  {
    icon: "activity",
    label: "Sustained Activity",
    desc: "Activity in each of 3 rolling 2-month windows",
  },
];

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 20, gap: 12 },
  headerSection: { gap: 16, marginBottom: 8 },

  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  screenBadge: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginBottom: 4 },
  screenTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginTop: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  countdownCard: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: "center", gap: 4 },
  countdownLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  countdown: { fontSize: 52, fontFamily: "Inter_700Bold", letterSpacing: 4 },
  countdownSub: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 3 },

  // Banking card
  bankingCard: { borderWidth: 1.5, borderRadius: 16, padding: 16, gap: 14 },
  bankingHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  bankingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  bankingTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  bankingSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  bankingStats: { flexDirection: "row", alignItems: "center" },
  bankingStat: { flex: 1, alignItems: "center", gap: 4 },
  bankingBig: { fontSize: 20, fontFamily: "Inter_700Bold" },
  bankingSmall: { fontSize: 11, fontFamily: "Inter_400Regular" },
  bankingDivider: { width: 1, height: 40, marginHorizontal: 12 },
  rateRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 12, borderTopWidth: 1 },
  rateNote: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },

  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, alignItems: "center", gap: 6 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },

  checkingCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 },
  checkingTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  checkRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  checkIconBg: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  checkContent: { flex: 1, gap: 2 },
  checkLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  checkDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  liveFeedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveFeedTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  liveIndicator: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  liveFeedNote: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: -4 },

  obsItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  obsIconBg: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  obsContent: { flex: 1, gap: 3 },
  obsType: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  obsLocker: { fontSize: 12, fontFamily: "Inter_400Regular" },
  obsSeverity: { flexDirection: "row", gap: 3, alignItems: "center" },
  severityBar: { width: 4, height: 14, borderRadius: 2 },
  emptyState: { alignItems: "center", gap: 8, paddingVertical: 32 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
